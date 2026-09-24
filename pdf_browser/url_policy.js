const dns = require("node:dns").promises;
const http = require("node:http");
const net = require("node:net");
const ipaddr = require("ipaddr.js");

function denied() {
  const error = new Error("URL destination is not public");
  error.code = "URL_NOT_PUBLIC";
  return error;
}

function isAllowedAddress(address, allowLoopback) {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast" || (allowLoopback && parsed.range() === "loopback");
  } catch (_) {
    return false;
  }
}

async function resolvePublicTarget(value, lookup = dns.lookup, options = {}) {
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    throw denied();
  }
  const allowLoopback = options.allowLoopback === true;
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && !allowLoopback)) {
    throw denied();
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw denied();
  }
  if (!ipaddr.isValid(hostname) && !hostname.includes(".") && !(allowLoopback && hostname === "localhost")) {
    throw denied();
  }
  let addresses;
  try {
    addresses = ipaddr.isValid(hostname)
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true, verbatim: true });
  } catch (_) {
    throw denied();
  }
  if (!Array.isArray(addresses) || !addresses.length ||
      addresses.some(({ address }) => !isAllowedAddress(address, allowLoopback))) {
    throw denied();
  }
  return {
    hostname,
    address: addresses[0].address,
    port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    protocol: url.protocol,
    path: url.pathname + url.search,
  };
}

function createSafeProxy(options = {}) {
  const lookup = options.lookup || dns.lookup;
  const server = http.createServer((request, response) => {
    (async () => {
      const target = await resolvePublicTarget(request.url, lookup, options);
      if (target.protocol !== "http:") throw denied();
      const headers = { ...request.headers, host: new URL(request.url).host };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      const upstream = http.request({
        hostname: target.address,
        port: target.port,
        path: target.path,
        method: request.method,
        headers,
        timeout: 45000,
      }, (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      });
      upstream.on("error", () => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
      request.pipe(upstream);
    })().catch(() => {
      response.writeHead(403);
      response.end();
    });
  });

  server.on("connect", (request, client, head) => {
    (async () => {
      const target = await resolvePublicTarget(`https://${request.url}`, lookup, options);
      if (target.port !== 443 && !options.allowLoopback) throw denied();
      const upstream = net.connect({ host: target.address, port: target.port });
      upstream.setTimeout(45000, () => upstream.destroy());
      upstream.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        client.pipe(upstream);
        upstream.pipe(client);
      });
      upstream.on("error", () => {
        if (!client.destroyed) client.destroy();
      });
      client.on("error", () => upstream.destroy());
      client.on("close", () => upstream.destroy());
    })().catch(() => {
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    });
  });
  return server;
}

module.exports = { createSafeProxy, resolvePublicTarget };
