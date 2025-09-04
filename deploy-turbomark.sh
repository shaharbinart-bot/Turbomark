#!/bin/bash

echo "🚀 Deploying TurboMark with Enterprise Backup Protection..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found! Please create it first."
    exit 1
fi

# Stop existing services
echo "⏹️ Stopping existing services..."
docker-compose down

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Build and start all services
echo "🏗️ Building and starting services..."
docker-compose up -d --build

# Wait for services to start
echo "⏳ Waiting for services to initialize..."
sleep 60

# Check service status
echo "🔍 Checking service status..."
docker-compose ps

# Check logs for backup services
echo "📋 Checking backup services..."
docker-compose logs backup-service --tail=10
docker-compose logs rollback-service --tail=10

echo "✅ Deployment complete!"
echo ""
echo "🌟 ACCESS YOUR TURBOMARK STACK:"
echo "📱 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:5000"
echo "🤖 AI Engine: http://localhost:8000"
echo "🛡️ Backup Dashboard: http://localhost:9002"
echo "📊 Grafana: http://localhost:3001"
echo "📈 Prometheus: http://localhost:9090"
echo ""
echo "💰 Your TurboMark is now protected with enterprise-level backups!"
