#!/bin/sh
# Production start: Python AI service on localhost only, Node on Render's public PORT.
# If the AI service dies, the app keeps working with its labelled fallback.
cd /app/ai-service && /app/ai-service/.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 &
cd /app && exec node server/dist/index.js
