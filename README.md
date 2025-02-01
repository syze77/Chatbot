# WhatsApp Support Chatbot 🤖

A powerful and scalable WhatsApp chatbot solution designed specifically for educational institutions. This system provides automated technical support through WhatsApp while offering administrators a comprehensive real-time dashboard for monitoring and managing support tickets.

## 📋 Key Features

- 🤖 **Smart Automated Support**
  - Natural language processing for better understanding
  - Customizable response templates
  - Multi-language support
  - Learning capability from interactions

- 📊 **Advanced Dashboard**
  - Real-time monitoring of active conversations
  - Performance metrics and KPIs
  - User satisfaction tracking
  - Support agent performance analytics

- 🛠 **Technical Capabilities**
  - Load balancing for high availability
  - Webhook integration support
  - REST API for external integrations
  - Encrypted message handling

## 🚀 Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- SQLite3
- Active WhatsApp Business API account
- SSL certificate for production deployment

### Installation

```bash
# Clone the repository
git clone https://github.com/syze77/Chatbot.git

# Enter directory
cd chatbot

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

### Configuration

Create a `.env` file with the following variables:

```env
WHATSAPP_API_KEY=your_api_key
WHATSAPP_PHONE_NUMBER=your_phone_number
DB_CONNECTION=sqlite
JWT_SECRET=your_secret_key
```

## 💻 Usage

```bash
# Development
npm run dev

# Production
npm run build
npm start

# Run tests
npm test
```

## 📚 API Documentation

### Endpoints

- `POST /api/message` - Send message
- `GET /api/conversations` - List conversations
- `PUT /api/settings` - Update settings

Full API documentation available at `/docs` when running the server.

## 🔧 Troubleshooting

Common issues and solutions:

1. **Connection Issues**
   - Verify WhatsApp API credentials
   - Check network connectivity
   - Ensure proper SSL configuration

2. **Database Errors**
   - Verify database permissions
   - Check connection string
   - Ensure migrations are up to date

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Follow ESLint configuration
- Write tests for new features
- Update documentation as needed
- Follow semantic versioning

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For support, email support@chatbot.com or join our Discord channel.