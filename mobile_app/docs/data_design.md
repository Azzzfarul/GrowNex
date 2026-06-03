# Firestore Data Structure

## 🟢 1. USERS (top-level)
**Collection:** `users/{userId}`  
**Example Document:**
```json
{
  "username": "iman",
  "email": "iman@gmail.com",
  "passwordHash": "...",
  "notificationEnabled": true,
  "createdAt": ...
}
🌱 2. ZONES (CORE of your system)
Collection: zones/{zoneId}

This is your MAIN dashboard entity.
⚠️ Not nested under user unless necessary.

Example Document:

json
{
  "userId": "user123",
  "zoneName": "Indoor Zone",
  "zoneType": "indoor",
  "status": "healthy",
  "totalPlantSlots": 3,
  "zonePhotoUrl": "...",
  "deviceId": "deviceA",
  "createdAt": ...,
  "latestTemp": ...,
  "latestHumid": ...,
  "latestMoisture": ...,
  "latestLight": ...,
  "latestTimestamp": ...
}
🌿 3. PLANTS (depends on Zone)
Collection: plants/{plantId}

Uses zoneId + plantId reference.

Example Document:

json
{
  "zoneId": "zone1",
  "plantName": "Orchid",
  "species": "Phalaenopsis",
  "status": "healthy",
  "slotNumber": 1,
  "preferredMoistureMin": 30,
  "preferredMoistureMax": 70,
  "preferredHumidityMin": 40,
  "preferredHumidityMax": 80,
  "preferredTemperatureMin": 20,
  "preferredTemperatureMax": 30,
  "preferredLightCondition": "medium",
  "notes": "...",
  "createdAt": ...
}
📊 4. SENSOR READINGS (HIGH VOLUME → KEEP SEPARATE)
Collection: zones/{zoneId}/sensorReadings/{readingId}

⚠️ Do NOT put inside zone document.

Example Document:

json
{
  "plantId": "plant1",
  "moisture": 55,
  "temperature": 28,
  "humidity": 60,
  "lightLevel": 780,
  "timestamp": ...
}
📸 5. PLANT IMAGES
Collection: zones/{zoneId}/plantImages/{imageId}

Example Document:

json
{
  "plantId": "plant1",
  "imageUrl": "...",
  "capturedAt": ...
}
📱 6. NOTIFICATIONS (GLOBAL, EASY QUERYING)
Collection: notifications/{notificationId}

❌ Do NOT nest under zone/user.

Example Document:

json
{
  "userId": "user123",
  "zoneId": "zone1",
  "title": "Low Moisture",
  "message": "Plant needs water",
  "type": "warning",
  "isRead": false,
  "createdAt": ...
}
🤖 7. AUTOMATION CONFIG (1 PER ZONE)
Collection: automationConfig/{zoneId}

Example Document:

json
{
  "autoWateringEnabled": true,
  "wateringThreshold": 30,
  "autoLightingEnabled": true,
  "lightingSchedule": "08:00-18:00",
  "autoFertilizingEnabled": false,
  "fertilizingSchedule": "weekly",
  "aiRecommended": true
}
🕒 8. AUTOMATION HISTORY (LOGS → HIGH VOLUME)
Collection: zones/{zoneId}/automationHistory/{historyId}

Example Document:

json
{
  "actionType": "watering",
  "triggeredBy": "auto",
  "timestamp": ...
}
📟 9. DEVICE
Collection: devices/{deviceId}

Example Document:

json
