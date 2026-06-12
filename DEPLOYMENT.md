# MarketRadar Deployment Guide

This guide covers deploying MarketRadar to Render.com for production hosting.

## Quick Start (Automatic Deployment)

The easiest way to deploy is using the included `render.yaml` configuration file.

### Prerequisites

1. **Render.com Account**
   - Sign up at [render.com](https://render.com)
   - Free tier is sufficient for testing

2. **GitHub Repository**
   - Push your MarketRadar code to a GitHub repository
   - Ensure `render.yaml` is in the root directory

3. **Groq API Key (Optional)**
   - Get a free key from [console.groq.com](https://console.groq.com)
   - Without it, the app uses realistic mock responses

### Step-by-Step Deployment

#### 1. Prepare Your Code

```bash
# Commit all changes
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

#### 2. Create Render Service

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Render will automatically detect `render.yaml` and configure both services

#### 3. Configure Environment Variables

In your Render service settings, add these environment variables:

**Backend Service:**
- `NODE_ENV`: `production`
- `PORT`: `3001`
- `FRONTEND_ORIGIN`: `https://marketradar-frontend.onrender.com` (update with your actual frontend URL)
- `GROQ_API_KEY`: Your Groq API key (optional)

**Frontend Service:**
- `VITE_API_URL`: `https://marketradar-backend.onrender.com` (update with your actual backend URL)

#### 4. Deploy

- Click "Deploy Web Service"
- Render will build and deploy both backend and frontend
- Wait for the deployment to complete (usually 2-5 minutes)

#### 5. Access Your Application

- Backend: `https://marketradar-backend.onrender.com`
- Frontend: `https://marketradar-frontend.onrender.com`
- Health check: `https://marketradar-backend.onrender.com/health`

## Architecture Overview

### Backend Service
- **Runtime**: Node.js 22+
- **Port**: 3001
- **Database**: SQLite with persistent disk (1GB)
- **Features**: REST API, WebSocket server, Agent swarm orchestration

### Frontend Service
- **Runtime**: Node.js 22+
- **Build**: Vite production build
- **Serve**: Vite preview server
- **Features**: React dashboard, D3 visualizations, WebSocket client

### Database Persistence

The SQLite database is stored on a Render persistent disk:
- **Mount Point**: `/opt/render/project/backend/data`
- **Size**: 1GB
- **Purpose**: Survives redeployments and maintains mission data

## Manual Deployment (Alternative)

If you prefer manual configuration without `render.yaml`:

### Backend Service Configuration

- **Name**: `marketradar-backend`
- **Runtime**: Node
- **Build Command**: `cd backend && npm install`
- **Start Command**: `cd backend && npm start`
- **Persistent Disk**: 
  - Name: `data`
  - Mount Path: `/opt/render/project/backend/data`
  - Size: 1GB

### Frontend Service Configuration

- **Name**: `marketradar-frontend`
- **Runtime**: Node
- **Build Command**: `cd frontend && npm install && npm run build`
- **Start Command**: `cd frontend && npm run preview`

## Troubleshooting

### Database Issues

**Problem**: Database is lost on redeploy
- **Solution**: Ensure persistent disk is properly mounted at `/opt/render/project/backend/data`

### CORS Errors

**Problem**: Frontend cannot connect to backend
- **Solution**: Set `FRONTEND_ORIGIN` environment variable to match your frontend URL

### WebSocket Connection Issues

**Problem**: Real-time updates not working
- **Solution**: Ensure WebSocket URL is correctly configured in frontend environment variables

### Build Failures

**Problem**: Deployment fails during build
- **Solution**: Check Render build logs for specific error messages, usually dependency-related

## Environment Variables Reference

### Backend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Environment mode |
| `PORT` | No | `3001` | Server port |
| `FRONTEND_ORIGIN` | No | `http://localhost:5173` | CORS allowed origin |
| `GROQ_API_KEY` | No | — | Groq API key for live LLM calls |

### Frontend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | — | Backend API URL for production |

## Cost Considerations

### Render Free Tier

- **Backend**: Free tier with spin-down after 15 minutes of inactivity
- **Frontend**: Free tier with spin-down after 15 minutes of inactivity
- **Persistent Disk**: 1GB included in free tier

### Paid Tier (Recommended for Production)

- **Starter Plan**: $7/month per service
- **No spin-down**: Always available
- **Better performance**: More CPU and memory

## Monitoring and Logs

### View Logs

1. Go to your Render dashboard
2. Click on the service (backend or frontend)
3. Click "Logs" tab
4. View real-time logs and deployment history

### Health Checks

Backend health endpoint: `https://marketradar-backend.onrender.com/health`

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "db": true
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Security Considerations

1. **API Keys**: Never commit API keys to git. Use Render environment variables
2. **CORS**: Configure `FRONTEND_ORIGIN` to only allow your frontend domain
3. **WebSocket**: Ensure WebSocket connections are properly authenticated in production
4. **Database**: SQLite is file-based; ensure persistent disk is properly configured

## Scaling Considerations

### Current Limitations

- SQLite is not horizontally scalable
- Single-instance deployment
- Free tier has spin-down times

### Production Recommendations

For production use with high traffic:

1. **Database**: Migrate to PostgreSQL or MySQL
2. **Caching**: Add Redis for session management
3. **Load Balancing**: Use multiple backend instances
4. **Monitoring**: Add application performance monitoring (APM)

## Support

- **Render Documentation**: [docs.render.com](https://docs.render.com)
- **MarketRadar Issues**: Check GitHub issues or create a new one
- **Groq API**: [console.groq.com](https://console.groq.com)
