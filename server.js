const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let totalRevenue = 0;
let orders = []; // Current active orders

io.on('connection', (socket) => {
    // Send initial data to whoever connects
    socket.emit('init-data', { orders, totalRevenue });

    // When cashier sends an order
    socket.on('place-order', (newOrder) => {
        newOrder.id = Date.now(); // Unique ID
        newOrder.status = 'pending';
        orders.push(newOrder);
        totalRevenue += newOrder.total;

        // Broadcast to everyone (Barista and Cashier)
        io.emit('order-update', { orders, totalRevenue });
    });

    // When barista marks order as complete
    socket.on('complete-order', (orderId) => {
        orders = orders.filter(o => o.id !== orderId);
        io.emit('order-update', { orders, totalRevenue });
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});