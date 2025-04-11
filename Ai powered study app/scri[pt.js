// script.js - Updated frontend script to connect with the backend

document.addEventListener('DOMContentLoaded', function() {
    // API base URL - change this when deploying
    const API_URL = 'http://localhost:5000/api';
    
    // Check if user is logged in
    const token = localStorage.getItem('token');
    const isLoggedIn = !!token;
    
    // UI Elements
    const loginBtn = document.querySelector('.cta-btn');
    const chatbotBtn = document.querySelector('.chatbot-btn');
    const chatbotWindow = document.querySelector('.chatbot-window');
    const chatbotMessages = document.querySelector('.chatbot-messages');
    const chatbotInput = document.querySelector('.chatbot-input input');
    const chatbotSend = document.querySelector('.chatbot-input button');
    const chatbotClose = document.querySelector('.chatbot-close');
    
    // Add Auth UI - dynamically create login/signup forms
    createAuthUI();
    
    // Event listeners
    loginBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (isLoggedIn) {
            // Handle logout
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.reload();
        } else {
            // Show login modal
            document.getElementById('auth-modal').style.display = 'flex';
            }
        });
    });
    
    // Update UI based on auth state
    updateUIForAuthState();
    
    // Setup chatbot
    setupChatbot();
    
    // Mobile menu toggle
    document.getElementById('mobile-menu').addEventListener('click', function() {
        document.getElementById('nav-menu').classList.toggle('active');
    });
    
    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            if (href === '#' || href === '#signup') {
                return; // Let default handler work for these
            }
            
            e.preventDefault();
            
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                window.scrollTo({
                    top: target.offsetTop - 80,
                    behavior: 'smooth'
                });
                
                // Close mobile menu if open
                document.getElementById('nav-menu').classList.remove('active');
            }
        });
    });
    
    // Testimonial Slider
    setupTestimonialSlider();
    
    // Create Study Plan form
    if (document.getElementById('create-study-plan-form')) {
        document.getElementById('create-study-plan-form').addEventListener('submit', function(e) {
            e.preventDefault();
            if (!isLoggedIn) {
                showAuthModal('Please login to create a study plan');
                return;
            }
            
            const subjects = document.getElementById('plan-subjects').value.split(',').map(s => s.trim());
            const duration = document.getElementById('plan-duration').value;
            const goals = document.getElementById('plan-goals').value;
            
            createStudyPlan(subjects, duration, goals);
        });
    }
    
    // Create Flashcards form
    if (document.getElementById('create-flashcards-form')) {
        document.getElementById('create-flashcards-form').addEventListener('submit', function(e) {
            e.preventDefault();
            if (!isLoggedIn) {
                showAuthModal('Please login to create flashcards');
                return;
            }
            
            const subject = document.getElementById('flashcard-subject').value;
            const topic = document.getElementById('flashcard-topic').value;
            const count = document.getElementById('flashcard-count').value;
            
            generateFlashcards(subject, topic, count);
        });
    }
    
    // Question Generator form
    if (document.getElementById('question-generator-form')) {
        document.getElementById('question-generator-form').addEventListener('submit', function(e) {
            e.preventDefault();
            if (!isLoggedIn) {
                showAuthModal('Please login to generate questions');
                return;
            }
            
            const subject = document.getElementById('question-subject').value;
            const topic = document.getElementById('question-topic').value;
            const count = document.getElementById('question-count').value;
            const difficulty = document.getElementById('question-difficulty').value;
            
            generateQuestions(subject, topic, count, difficulty);
        });
    }
    
    // Functions
    
    function updateUIForAuthState() {
        if (isLoggedIn) {
            const user = JSON.parse(localStorage.getItem('user'));
            loginBtn.textContent = 'Logout';
            
            // Add user dashboard link
            const navbar = document.querySelector('nav ul');
            if (navbar && !document.getElementById('dashboard-link')) {
                const dashboardLi = document.createElement('li');
                const dashboardLink = document.createElement('a');
                dashboardLink.href = '/dashboard.html';
                dashboardLink.textContent = 'My Dashboard';
                dashboardLink.id = 'dashboard-link';
                dashboardLi.appendChild(dashboardLink);
                navbar.appendChild(dashboardLi);
            }
            
            // Update greeting if on dashboard page
            const dashboardGreeting = document.getElementById('dashboard-greeting');
            if (dashboardGreeting && user) {
                dashboardGreeting.textContent = `Welcome back, ${user.name}!`;
            }
            
            // Load user's study plans if on dashboard
            if (document.getElementById('study-plans-container')) {
                loadStudyPlans();
            }
            
            // Load user's resources if on resources page
            if (document.getElementById('resources-container')) {
                loadResources();
            }
        } else {
            loginBtn.textContent = 'Get Started';
            
            // Remove dashboard link if exists
            const dashboardLink = document.getElementById('dashboard-link');
            if (dashboardLink) {
                dashboardLink.parentNode.remove();
            }
        }
    }
    
    function createAuthUI() {
        const authModal = document.createElement('div');
        authModal.id = 'auth-modal';
        authModal.className = 'modal';
        authModal.innerHTML = `
            <div class="modal-content">
                <span class="close" id="auth-close">&times;</span>
                <h2 id="auth-title">Login</h2>
                <form id="auth-form">
                    <input type="text" id="auth-username" placeholder="Username" required>
                    <input type="password" id="auth-password" placeholder="Password" required>
                    <button type="submit">Login</button>
                    <p>Don't have an account? <a href="#" id="show-signup">Sign Up</a></p>
                </form>
            </div>`;
        
        document.body.appendChild(authModal);
        
        // Event listeners for modal
        document.getElementById('auth-close').addEventListener('click', function() {
            authModal.style.display = 'none';
        });
        
        document.getElementById('show-signup').addEventListener('click', function(e) {
            e.preventDefault();
            showSignupForm();
        });
        
        // Handle form submission
        document.getElementById('auth-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const username = document.getElementById('auth-username').value;
            const password = document.getElementById('auth-password').value;
            
            if (document.getElementById('auth-title').textContent === 'Login') {
                login(username, password);
            } else {
                signup(username, password);
            }
        });
    }