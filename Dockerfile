FROM python:3.12-slim

WORKDIR /app

COPY cloud/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY cloud/ .
COPY config.json .

CMD ["python", "run.py"]
