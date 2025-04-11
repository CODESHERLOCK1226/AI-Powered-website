// server.js - Main backend file for BrainBoost AI Study Resources

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Configuration, OpenAIApi } = require('openai');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/brainboost', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Set up OpenAI configuration
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Define User Schema
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    subjects: [String],
    learningStyle: String,
    createdAt: { type: Date, default: Date.now }
});

// Define Study Plan Schema
const StudyPlanSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    description: String,
    subjects: [String],
    schedule: [{
        day: String,
        tasks: [{
            subject: String,
            duration: Number,
            description: String,
            completed: { type: Boolean, default: false }
        }]
    }],
    createdAt: { type: Date, default: Date.now }
});

// Define Study Resource Schema
const ResourceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    subject: String,
    type: String, // flashcard, notes, summary, etc.
    content: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now }
});

// Define Chat History Schema
const ChatSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    messages: [{
        role: String, // user or assistant
        content: String,
        timestamp: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

// Create models
const User = mongoose.model('User', UserSchema);
const StudyPlan = mongoose.model('StudyPlan', StudyPlanSchema);
const Resource = mongoose.model('Resource', ResourceSchema);
const Chat = mongoose.model('Chat', ChatSchema);

// Authentication middleware
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret_key_change_in_production');
        const user = await User.findById(decoded.id);
        
        if (!user) {
            throw new Error();
        }
        
        req.token = token;
        req.user = user;
        next();
    } catch (error) {
        res.status(401).send({ message: 'Please authenticate' });
    }
};

// Routes

// User Registration
app.post('/api/users/register', async (req, res) => {
    try {
        const { name, email, password, subjects, learningStyle } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create new user
        const user = new User({
            name,
            email,
            password: hashedPassword,
            subjects: subjects || [],
            learningStyle: learningStyle || 'visual'
        });
        
        await user.save();
        
        // Create token
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET || 'default_secret_key_change_in_production',
            { expiresIn: '30d' }
        );
        
        res.status(201).json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                subjects: user.subjects,
                learningStyle: user.learningStyle
            },
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// User Login
app.post('/api/users/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        // Validate password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        // Create token
        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET || 'default_secret_key_change_in_production',
            { expiresIn: '30d' }
        );
        
        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                subjects: user.subjects,
                learningStyle: user.learningStyle
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user profile
app.get('/api/users/me', auth, async (req, res) => {
    res.json({
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        subjects: req.user.subjects,
        learningStyle: req.user.learningStyle
    });
});

// Update user profile
app.put('/api/users/me', auth, async (req, res) => {
    try {
        const { name, subjects, learningStyle } = req.body;
        
        // Update fields
        if (name) req.user.name = name;
        if (subjects) req.user.subjects = subjects;
        if (learningStyle) req.user.learningStyle = learningStyle;
        
        await req.user.save();
        
        res.json({
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            subjects: req.user.subjects,
            learningStyle: req.user.learningStyle
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create AI study plan
app.post('/api/study-plans', auth, async (req, res) => {
    try {
        const { subjects, duration, goals } = req.body;
        
        // Generate study plan with AI
        const prompt = `
            Create a detailed study plan for a student with the following details:
            Subjects: ${subjects.join(', ')}
            Study Duration: ${duration} days
            Learning Goals: ${goals}
            Learning Style: ${req.user.learningStyle}
            
            Format the study plan as a JSON object with the following structure:
            {
                "title": "Study Plan Title",
                "description": "Brief description of the study plan",
                "subjects": ["Subject1", "Subject2"],
                "schedule": [
                    {
                        "day": "Day 1",
                        "tasks": [
                            {
                                "subject": "Subject name",
                                "duration": 60,
                                "description": "Task description"
                            }
                        ]
                    }
                ]
            }
        `;
        
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: prompt,
            max_tokens: 1000,
            temperature: 0.7,
        });
        
        let studyPlanData;
        try {
            studyPlanData = JSON.parse(response.data.choices[0].text.trim());
        } catch (error) {
            // Fallback in case the AI doesn't generate valid JSON
            studyPlanData = {
                title: `${subjects[0]} Study Plan`,
                description: `A personalized study plan for ${subjects.join(', ')}`,
                subjects: subjects,
                schedule: Array.from({ length: duration }, (_, i) => ({
                    day: `Day ${i + 1}`,
                    tasks: subjects.map(subject => ({
                        subject: subject,
                        duration: 60,
                        description: `Study ${subject} fundamentals`
                    }))
                }))
            };
        }
        
        // Create and save study plan
        const studyPlan = new StudyPlan({
            userId: req.user._id,
            ...studyPlanData
        });
        
        await studyPlan.save();
        
        res.status(201).json(studyPlan);
    } catch (error) {
        console.error('Study plan creation error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's study plans
app.get('/api/study-plans', auth, async (req, res) => {
    try {
        const studyPlans = await StudyPlan.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.json(studyPlans);
    } catch (error) {
        console.error('Get study plans error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get specific study plan
app.get('/api/study-plans/:id', auth, async (req, res) => {
    try {
        const studyPlan = await StudyPlan.findOne({ 
            _id: req.params.id,
            userId: req.user._id
        });
        
        if (!studyPlan) {
            return res.status(404).json({ message: 'Study plan not found' });
        }
        
        res.json(studyPlan);
    } catch (error) {
        console.error('Get study plan error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update study task completion status
app.patch('/api/study-plans/:planId/tasks/:taskId', auth, async (req, res) => {
    try {
        const { completed } = req.body;
        const { planId, taskId } = req.params;
        
        const studyPlan = await StudyPlan.findOne({ 
            _id: planId,
            userId: req.user._id
        });
        
        if (!studyPlan) {
            return res.status(404).json({ message: 'Study plan not found' });
        }
        
        // Find and update the specific task
        let taskFound = false;
        
        studyPlan.schedule.forEach(day => {
            day.tasks.forEach(task => {
                if (task._id.toString() === taskId) {
                    task.completed = completed;
                    taskFound = true;
                }
            });
        });
        
        if (!taskFound) {
            return res.status(404).json({ message: 'Task not found' });
        }
        
        await studyPlan.save();
        
        res.json(studyPlan);
    } catch (error) {
        console.error('Update task error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Generate AI explanations
app.post('/api/generate-explanation', auth, async (req, res) => {
    try {
        const { subject, topic, difficulty } = req.body;
        
        const prompt = `
            Explain the following ${subject} topic: "${topic}"
            
            Make your explanation appropriate for a ${difficulty} level student.
            Learning style preference: ${req.user.learningStyle}
            
            Include:
            1. A clear definition
            2. Main concepts
            3. 2-3 examples
            4. Common misconceptions
            5. A simple analogy to help understand
        `;
        
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: prompt,
            max_tokens: 1000,
            temperature: 0.7,
        });
        
        res.json({ explanation: response.data.choices[0].text.trim() });
    } catch (error) {
        console.error('Generate explanation error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Generate practice questions
app.post('/api/generate-questions', auth, async (req, res) => {
    try {
        const { subject, topic, count, difficulty } = req.body;
        
        const prompt = `
            Generate ${count} practice ${difficulty}-level questions about "${topic}" in ${subject}.
            
            Format each question as a JSON object with the following structure:
            {
                "questions": [
                    {
                        "question": "Question text",
                        "options": ["Option A", "Option B", "Option C", "Option D"],
                        "correctAnswer": "Option B",
                        "explanation": "Explanation of why this is the correct answer"
                    }
                ]
            }
        `;
        
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: prompt,
            max_tokens: 1500,
            temperature: 0.7,
        });
        
        let questionsData;
        try {
            questionsData = JSON.parse(response.data.choices[0].text.trim());
        } catch (error) {
            // Fallback in case the AI doesn't generate valid JSON
            questionsData = {
                questions: [
                    {
                        question: `Sample question about ${topic} in ${subject}`,
                        options: ["Option A", "Option B", "Option C", "Option D"],
                        correctAnswer: "Option B",
                        explanation: "This is a placeholder explanation."
                    }
                ]
            };
        }
        
        res.json(questionsData);
    } catch (error) {
        console.error('Generate questions error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create or update flashcards
app.post('/api/resources/flashcards', auth, async (req, res) => {
    try {
        const { title, subject, flashcards } = req.body;
        
        // Check if resource already exists
        let resource = await Resource.findOne({
            userId: req.user._id,
            title: title,
            subject: subject,
            type: 'flashcard'
        });
        
        if (resource) {
            // Update existing resource
            resource.content = flashcards;
            await resource.save();
        } else {
            // Create new resource
            resource = new Resource({
                userId: req.user._id,
                title,
                subject,
                type: 'flashcard',
                content: flashcards
            });
            
            await resource.save();
        }
        
        res.status(201).json(resource);
    } catch (error) {
        console.error('Flashcards creation error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get user's resources
app.get('/api/resources', auth, async (req, res) => {
    try {
        const resources = await Resource.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.json(resources);
    } catch (error) {
        console.error('Get resources error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Generate flashcards with AI
app.post('/api/generate-flashcards', auth, async (req, res) => {
    try {
        const { subject, topic, count } = req.body;
        
        const prompt = `
            Generate ${count} flashcards about "${topic}" in ${subject}.
            
            Format the flashcards as a JSON object with the following structure:
            {
                "flashcards": [
                    {
                        "front": "Front of flashcard with question or term",
                        "back": "Back of flashcard with answer or definition"
                    }
                ]
            }
        `;
        
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: prompt,
            max_tokens: 1000,
            temperature: 0.7,
        });
        
        let flashcardsData;
        try {
            flashcardsData = JSON.parse(response.data.choices[0].text.trim());
        } catch (error) {
            // Fallback in case the AI doesn't generate valid JSON
            flashcardsData = {
                flashcards: [
                    {
                        front: `What is ${topic}?`,
                        back: `This is a placeholder definition for ${topic} in ${subject}.`
                    }
                ]
            };
        }
        
        res.json(flashcardsData);
    } catch (error) {
        console.error('Generate flashcards error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Generate study notes with AI
app.post('/api/generate-notes', auth, async (req, res) => {
    try {
        const { subject, topic } = req.body;
        
        const prompt = `
            Create comprehensive study notes about "${topic}" in ${subject}.
            
            Structure the notes for a ${req.user.learningStyle} learner with:
            1. Key concepts
            2. Definitions
            3. Important formulas or principles
            4. Examples
            5. Practice problems if applicable
            
            Format the response in Markdown.
        `;
        
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: prompt,
            max_tokens: 1500,
            temperature: 0.7,
        });
        
        const notes = response.data.choices[0].text.trim();
        
        // Save to resources
        const resource = new Resource({
            userId: req.user._id,
            title: `${topic} Notes`,
            subject,
            type: 'notes',
            content: notes
        });
        
        await resource.save();
        
        res.status(201).json({
            resource,
            notes
        });
    } catch (error) {
        console.error('Generate notes error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// AI Chatbot endpoint
app.post('/api/chat', auth, async (req, res) => {
    try {
        const { message } = req.body;
        
        // Find or create chat history
        let chat = await Chat.findOne({ userId: req.user._id });
        
        if (!chat) {
            chat = new Chat({
                userId: req.user._id,
                messages: []
            });
        }
        
        // Add user message to history
        chat.messages.push({
            role: 'user',
            content: message
        });
        
        // Get recent chat history (last 10 messages)
        const recentMessages = chat.messages.slice(-10);
        
        // Create context for AI
        const contextMessages = [
            {
                role: "system",
                content: `You are an AI study assistant helping a student.
                The student's name is ${req.user.name}.
                They are studying these subjects: ${req.user.subjects.join(', ')}.
                Their preferred learning style is ${req.user.learningStyle}.
                Provide helpful, concise answers to their questions.
                If they ask about a topic not in their subjects, you can still help them.`
            },
            ...recentMessages.map(msg => ({
                role: msg.role,
                content: msg.content
            }))
        ];
        
        // Call OpenAI chat completion
        const completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: contextMessages,
        });
        
        const aiResponse = completion.data.choices[0].message.content;
        
        // Add AI response to history
        chat.messages.push({
            role: 'assistant',
            content: aiResponse
        });
        
        await chat.save();
        
        res.json({ message: aiResponse });
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get chat history
app.get('/api/chat/history', auth, async (req, res) => {
    try {
        const chat = await Chat.findOne({ userId: req.user._id });
        
        if (!chat) {
            return res.json({ messages: [] });
        }
        
        res.json({ messages: chat.messages });
    } catch (error) {
        console.error('Get chat history error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Clear chat history
app.delete('/api/chat/history', auth, async (req, res) => {
    try {
        await Chat.findOneAndDelete({ userId: req.user._id });
        res.json({ message: 'Chat history cleared' });
    } catch (error) {
        console.error('Clear chat history error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Analytics endpoints
app.get('/api/analytics/study-time', auth, async (req, res) => {
    try {
        const studyPlans = await StudyPlan.find({ userId: req.user._id });
        
        // Calculate completed vs. planned study time
        let totalPlannedTime = 0;
        let totalCompletedTime = 0;
        
        studyPlans.forEach(plan => {
            plan.schedule.forEach(day => {
                day.tasks.forEach(task => {
                    totalPlannedTime += task.duration;
                    if (task.completed) {
                        totalCompletedTime += task.duration;
                    }
                });
            });
        });
        
        // Calculate subject distribution
        const subjectDistribution = {};
        
        studyPlans.forEach(plan => {
            plan.schedule.forEach(day => {
                day.tasks.forEach(task => {
                    if (!subjectDistribution[task.subject]) {
                        subjectDistribution[task.subject] = 0;
                    }
                    subjectDistribution[task.subject] += task.duration;
                });
            });
        });
        
        res.json({
            totalPlannedTime,
            totalCompletedTime,
            completionRate: totalPlannedTime > 0 ? (totalCompletedTime / totalPlannedTime) * 100 : 0,
            subjectDistribution
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});