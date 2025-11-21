import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { config } from '../config/config.js';

const users = new Map();

export const initializeSocket = (io) => {
  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(decoded.id);

      if (!user) {
        return next(new Error('User not found'));
      }

      socket.userId = user._id.toString();
      socket.userName = user.name;
      socket.userRole = user.role;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  // Socket connection
  io.on('connection', async (socket) => {
    console.log(`✅ User connected: ${socket.userName} (${socket.userRole})`);

    users.set(socket.userId, socket.id);

    await User.findByIdAndUpdate(socket.userId, {
      isOnline: true,
      lastSeen: new Date()
    });

    socket.broadcast.emit('user-online', {
      userId: socket.userId,
      userName: socket.userName,
      userRole: socket.userRole
    });

    socket.on('get-online-users', async () => {
      const onlineUsers = await User.find({ isOnline: true })
        .select('name email role');
      socket.emit('online-users', onlineUsers);
    });

    socket.on('private-message', ({ to, message }) => {
      const recipientSocketId = users.get(to);

      if (recipientSocketId) {
        io.to(recipientSocketId).emit('private-message', {
          from: socket.userId,
          fromName: socket.userName,
          message,
          timestamp: new Date()
        });
      }
    });

    socket.on('typing', ({ to }) => {
      const recipientSocketId = users.get(to);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('user-typing', {
          userId: socket.userId,
          userName: socket.userName
        });
      }
    });

    socket.on('join-room', (roomId) => {
      socket.join(roomId);
      console.log(`User ${socket.userName} joined room: ${roomId}`);

      socket.to(roomId).emit('user-joined', {
        userId: socket.userId,
        userName: socket.userName,
        roomId
      });
    });

    socket.on('leave-room', (roomId) => {
      socket.leave(roomId);
      console.log(`User ${socket.userName} left room: ${roomId}`);

      socket.to(roomId).emit('user-left', {
        userId: socket.userId,
        userName: socket.userName,
        roomId
      });
    });

    socket.on('room-message', ({ roomId, message }) => {
      io.to(roomId).emit('room-message', {
        from: socket.userId,
        fromName: socket.userName,
        message,
        roomId,
        timestamp: new Date()
      });
    });

    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.userName}`);

      users.delete(socket.userId);

      await User.findByIdAndUpdate(socket.userId, {
        isOnline: false,
        lastSeen: new Date()
      });

      socket.broadcast.emit('user-offline', {
        userId: socket.userId,
        userName: socket.userName
      });
    });
  });
};

export const getOnlineUsers = () => {
  return Array.from(users.keys());
};