FROM node:18-alpine

# Install backup utilities
RUN apk add --no-cache postgresql-client redis gzip curl

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies  
RUN npm install

# Copy source code
COPY . .

EXPOSE 8000

CMD ["node", "app.js"]
