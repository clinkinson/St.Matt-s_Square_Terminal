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
let completedOrders = [];

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
    socket.emit('init-data', { orders, totalRevenue, completedOrders });

    // MOVE YOUR LISTENERS INSIDE THIS BLOCK:
    socket.on('place-order', (newOrder) => {
        newOrder.id = Date.now() + Math.floor(Math.random() * 1000);
        const timeString = new Date().toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit'
        });

        if (newOrder.drinks && newOrder.drinks.length > 0) {
            const baristaOrder = {
                id: newOrder.id,
                customerName: newOrder.customerName,
                placedAt: timeString,
                timestamp: Date.now(), // Store the exact time the order was placed
                items: newOrder.drinks.map(name => ({ name, scratched: false }))
            };
            orders.push(baristaOrder);
        }

        const allItems = [...(newOrder.drinks || []), ...(newOrder.food || [])];
        logToCSV('ORDER_CREATED', newOrder.customerName, allItems, newOrder.total);
        totalRevenue += newOrder.total;
        io.emit('order-update', { orders, totalRevenue });
    });

    socket.on('item-scratch', ({ orderId, itemIndex, newState }) => {
        const order = orders.find(o => o.id === orderId);

        // CHANGE: Remove the toggle. Only update if newState is true.
        if (order && order.items[itemIndex] && newState === true) {
            order.items[itemIndex].scratched = true;

            // Auto-complete if everything is now scratched
            if (order.items.every(item => item.scratched)) {
                moveToHistory(orderId);
            } else {
                io.emit('order-update', { orders, totalRevenue });
            }
        }
    });

    socket.on('complete-order', (orderId) => {
        moveToHistory(orderId);
    });

    socket.on('restore-order', (orderId) => {
        const index = completedOrders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            const restored = completedOrders.splice(index, 1)[0];
            if (restored.items && Array.isArray(restored.items)) {
                restored.items.forEach(item => {
                    item.scratched = false;
                });
            }
            orders.push(restored);
            io.emit('order-update', { orders, totalRevenue });
            io.emit('history-update', { completedOrders });
        }
    });
    socket.emit('history-init', { completedOrders });

    function moveToHistory(orderId) {
        const index = orders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            const finished = orders.splice(index, 1)[0];
            finished.completedAt = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

            completedOrders.unshift(finished);
            if (completedOrders.length > 20) completedOrders.pop();

            logToCSV('ORDER_COMPLETED', finished.customerName, finished.items.map(i => i.name), 0);
            io.emit('order-update', { orders, totalRevenue });
            io.emit('history-update', { completedOrders }); // Sync history pages
        }
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});