FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy root package.json and lockfile (if exists)
COPY package*.json ./

# Copy package.json for backend and frontend to install dependencies
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies for both backend and frontend
RUN cd backend && npm install
RUN cd frontend && npm install

# Copy the rest of the application code
COPY . .

# Build the frontend (Vite builds into frontend/dist by default)
RUN cd frontend && npm run build

# Set the environment to production
ENV NODE_ENV=production

# The backend server port
EXPOSE 5000

# Set the working directory to backend to run the server
WORKDIR /app/backend

# Start the server
CMD ["npm", "start"]
