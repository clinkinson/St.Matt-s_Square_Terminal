const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let totalRevenue = 0;
let orders = []; // Current active orders

const logFile = 'fundraiser_logs.csv';
if (!fs.existsSync('fundraiser_logs.csv')) {
    fs.writeFileSync('fundraiser_logs.csv', 'Timestamp,Event,Customer,Items,Amount\n');
}

function logToCSV(event, customer, items, amount) {
    const timestamp = new Date().toLocaleString().replace(/,/g, '');
    const itemsString = `"${items.join('; ')}"`;
    const line = `${timestamp},${event},${customer},${itemsString},${amount}\n`;
    fs.appendFileSync(logFile, line);
}

io.on('connection', (socket) => {
    console.log('A user connected');

    // Send initial data to the newly connected client
    socket.emit('init-data', { orders, totalRevenue });

    // MOVE YOUR LISTENERS INSIDE THIS BLOCK:
    socket.on('place-order', (newOrder) => {
        newOrder.id = Date.now() + Math.floor(Math.random() * 1000);

        // Barista Logic: Re-label 'drinks' to 'items' so barista.html works
        if (newOrder.drinks && newOrder.drinks.length > 0) {
            const baristaOrder = {
                id: newOrder.id,
                customerName: newOrder.customerName,
                items: newOrder.drinks
            };
            orders.push(baristaOrder);
        }

        // CSV Logging Logic
        const allItems = [...(newOrder.drinks || []), ...(newOrder.food || [])];
        logToCSV('ORDER_CREATED', newOrder.customerName, allItems, newOrder.total);

        totalRevenue += newOrder.total;

        // Broadcast update to EVERYONE (Cashier and Barista)
        io.emit('order-update', { orders, totalRevenue });
    });

    socket.on('complete-order', (orderId) => {
        const orderToLog = orders.find(o => o.id === orderId);
        if (orderToLog) {
            logToCSV('ORDER_COMPLETED', orderToLog.customerName, orderToLog.items, 0);
            orders = orders.filter(o => o.id !== orderId);
            io.emit('order-update', { orders, totalRevenue });
        }
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});