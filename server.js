const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path'); // Import path module
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server); // Set up socket.io
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files from the current directory
app.use(express.static(path.join(__dirname))); // Serve static files

mongoose.connect('mongodb+srv://sanjeevani:sanjeeVaniMeds@sanjeevani.exguf.mongodb.net/?retryWrites=true&w=majority&appName=sanjeevani', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// User schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    firstName: { type: String },
    lastName: { type: String },
    dob: { type: Date },
    gender: { type: String },
    weight: { type: Number },
    subscriptions: [{ // Array of subscription objects
        status: { type: String },
        date: { type: Date },
        type: { type: String },
        transactionId: { type: String }
    }]
});

// Change the collection name to userData
const User = mongoose.model('userData', userSchema);

// Sign up route
app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const existingUser  = await User.findOne({ username });
        const existingEmail = await User.findOne({ email });
        if (existingUser ) {
            return res.status(400).json({ message: 'Username already exists' });
        }
        if (existingEmail) {
            return res.status(400).json({ message: 'Email already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser  = new User({ username, email, password: hashedPassword });
        await newUser .save();
        res.status(201).json({ message: 'User  created successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error creating user' });
    }
});

// Login route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        // Return user information along with success message
        res.status(200).json({ message: 'Login successful', username: user.username, email: user.email });
    } catch (error) {
        res.status(500).json({ message: 'Error logging in' });
    }
});

// Update user profile route
app.put('/updateProfile', async (req, res) => {
    const { username, firstName, lastName, dob, gender, weight } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User  not found' });
        }
        
        // Update user details
        user.firstName = firstName;
        user.lastName = lastName;
        user.dob = dob;
        user.gender = gender;
        user.weight = weight;

        await user.save();
        res.status(200).json({ message: 'Profile updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating profile' });
    }
});

// Subscription route
// Subscription route
app.post('/subscribe', async (req, res) => {
    console.log(req.body); // Log the incoming request body for debugging
    const { username, transactionId, price } = req.body;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User  not found' });
        }

        // Determine subscription status and type based on price
        let status, type;
        if (price === '₹49') {
            status = 'BASIC';
            type = 'monthly'; // Assuming this is a monthly subscription
        } else if (price === '₹99') {
            status = 'PREMIUM';
            type = 'monthly'; // Assuming this is a monthly subscription
        } else if (price === '₹199') {
            status = 'ELITE';
            type = 'monthly'; // Assuming this is a monthly subscription
        } else {
            status = 'FREE';
            type = 'none'; // No subscription
        }

        // Create a new subscription object
        const newSubscription = {
            status: status,
            date: new Date(),
            type: type,
            transactionId: transactionId
        };

        // Push the new subscription object into the subscriptions array
        user.subscriptions.push(newSubscription);

        await user.save();
        res.status(200).json({ message: 'Subscription updated successfully' });
    } catch (error) {
        console.error(error); // Log the error for debugging
        res.status(500).json({ message: 'Error updating subscription' });
    }
});
// Fetch subscription data route
app.get('/subscription/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ message: 'User  not found' });
        }

        // Return the subscriptions array
        res.status(200).json({ subscriptions: user.subscriptions });
    } catch (error) {
        console.error(error); // Log the error for debugging
        res.status(500).json({ message: 'Error fetching subscription data' });
    }
});

// Route to handle joining the video call
app.get('/video-call/:doctorId', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'video-call.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New client connected');

    // Join room
    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);
    });

    // Patient call request
    socket.on('patient-call-request', (roomId) => {
        socket.to(roomId).emit('patient-requesting-call');
    });

    // Handle ICE candidates
    socket.on('ice-candidate', ({ candidate, roomId }) => {
        socket.to(roomId).emit('ice-candidate', { candidate });
    });

    // Handle offers and answers
    socket.on('offer', ({ offer, roomId }) => {
        socket.to(roomId).emit('offer', { offer });
    });

    socket.on('answer', ({ answer, roomId }) => {
        socket.to(roomId).emit('answer', { answer });
    });

    // Leave room
    socket.on('leave-room', (roomId) => {
        socket.leave(roomId);
        console.log(`User left room: ${roomId}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});
app.post('/api/chat', async (req, res) => {
    const content = req.body.content;

    const url = 'https://api.blackbox.ai/api/chat';
    const data = {
        messages: [
            {
                content: `Please provide the following information for the medicine named "${content}":\n1. Composition (point-wise)\n2. Dosage according to different age groups and weight (in kg)\n3. Precautions for different people\n4. Type of medicine\n5. When to consume (before or after eating)\n6. When to stop consumption\n7. What does this medicine cure (uses)\nPlease keep the response short and easy to understand.`,
                role: 'user'
            }
        ],
        model: 'deepseek-ai/deepseek-llm-67b-chat',
        max_tokens: '1024'
    };

    const config = {
        headers: {
            'Content-Type': 'application/json'
        }
    };

    try {
        const response = await axios.post(url, data, config);
        
        // Format the response to be point-wise
        const formattedResponse = response.data.replace(/(\d+\.\s)/g, '\n$1'); // Ensure each point starts on a new line
        res.json({ formattedResponse });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'An error occurred while processing your request.' });
    }
});

// Start server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
