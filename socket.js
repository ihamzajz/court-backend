const { getAllowedOrigins, isProduction } = require("./config/env");
const { resolveActiveUserFromToken } = require("./utils/authSession");

let io = null;
const PUBLIC_ROOM = "audience:public";
const AUTHENTICATED_ROOM = "audience:authenticated";
const ADMINS_ROOM = "audience:admins";

const EVENT_AUDIENCE = {
  "courts:updated": PUBLIC_ROOM,
  "events:updated": PUBLIC_ROOM,
  "faqs:updated": PUBLIC_ROOM,
  "news:updated": PUBLIC_ROOM,
  "slides:updated": PUBLIC_ROOM,
  "bookings:updated": AUTHENTICATED_ROOM,
  "event-bookings:updated": AUTHENTICATED_ROOM,
  "users:updated": AUTHENTICATED_ROOM,
};

const getHandshakeToken = (socket) => {
  const authToken = String(socket.handshake?.auth?.token || "").trim();
  if (authToken) {
    return authToken;
  }

  const authorizationHeader = String(socket.handshake?.headers?.authorization || "").trim();
  if (authorizationHeader.startsWith("Bearer ")) {
    return authorizationHeader.slice("Bearer ".length).trim();
  }

  return "";
};

const buildSocketCorsOptions = () => {
  const allowedOrigins = getAllowedOrigins();

  if (!allowedOrigins.length) {
    return {
      origin: !isProduction,
      methods: ["GET", "POST", "PUT", "DELETE"],
    };
  }

  return {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  };
};

const initSocketServer = (server, socketIoServer) => {
  io = new socketIoServer(server, {
    cors: buildSocketCorsOptions(),
  });

  io.on("connection", async (socket) => {
    socket.join(PUBLIC_ROOM);

    const token = getHandshakeToken(socket);

    if (token) {
      try {
        const { user } = await resolveActiveUserFromToken(token);
        socket.data.user = user;
        socket.join(AUTHENTICATED_ROOM);
        socket.join(`user:${user.id}`);

        if (user.role === "admin" || user.role === "superadmin") {
          socket.join(ADMINS_ROOM);
        }
      } catch {
        socket.data.user = null;
      }
    }

    socket.emit("realtime:connected", {
      connectedAt: new Date().toISOString(),
      authenticated: Boolean(socket.data.user),
    });
  });

  return io;
};

const getSocketServer = () => io;

const disconnectUserSockets = async (userId) => {
  if (!io || !userId) return;

  const sockets = await io.in(`user:${userId}`).fetchSockets();
  sockets.forEach((socket) => socket.disconnect(true));
};

const emitRealtime = (eventName, payload = {}, options = {}) => {
  if (!io) return;

  const audience = options.audience || EVENT_AUDIENCE[eventName] || PUBLIC_ROOM;
  const message = {
    ...payload,
    emittedAt: new Date().toISOString(),
  };

  if (audience === "all") {
    io.emit(eventName, message);
    return;
  }

  if (audience === "admins") {
    io.to(ADMINS_ROOM).emit(eventName, message);
    return;
  }

  if (typeof audience === "string" && audience.startsWith("user:")) {
    io.to(audience).emit(eventName, message);
    return;
  }

  io.to(audience).emit(eventName, message);
};

module.exports = {
  initSocketServer,
  getSocketServer,
  disconnectUserSockets,
  emitRealtime,
};
