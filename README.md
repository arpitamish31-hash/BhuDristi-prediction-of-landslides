# BhuDrishti 🏔️
**AI-Based Landslide Early Warning & Risk Monitoring System — NER (North-East India)**  
Smart India Hackathon 2026 | Team InnoVision

---

## Project Structure

```
SIH'26/
├── ml/                        ← Python ML module
│   ├── data/
│   │   ├── generate_dataset.py    # Synthetic NER dataset generator
│   │   └── landslide_dataset.csv  # Generated after running above
│   ├── models/                    # Saved model artifacts (auto-created)
│   ├── api/
│   │   ├── app.py                 # Flask REST API
│   │   └── forecast_alert.py     # Open-Meteo 24h forecast integration
│   ├── preprocess.py              # Data pipeline (clean, engineer, scale)
│   ├── train.py                   # Model training + evaluation + plots
│   └── requirements.txt
│
└── dashboard/                 ← React frontend
    ├── src/
    │   ├── components/
    │   │   ├── AlertBanner.jsx    # Active high/critical alerts bar
    │   │   ├── MapView.jsx        # Leaflet NER risk heatmap
    │   │   ├── RiskDashboard.jsx  # Stat cards + Chart.js charts
    │   │   ├── PredictForm.jsx    # Manual risk prediction form
    │   │   └── ForecastPanel.jsx  # 24-hour early warning panel
    │   ├── services/
    │   │   └── api.js             # Axios API service layer
    │   ├── App.jsx
    │   └── index.css
    ├── package.json
    └── vite.config.js
```

---

## ML Model

- **Algorithm:** Random Forest Classifier (+ Gradient Boosting for comparison)
- **Features:** Slope, Elevation, Curvature, Aspect, Precipitation, NDVI,  
  Soil Moisture, Soil Type, LULC, Distance to Road/Fault  
  + Engineered: `rain_slope_interaction`, `moisture_clay_risk`, `fault_proximity`
- **Output:** Risk category — `Low / Moderate / High / Critical`
- **Dataset:** Synthetic NER data based on Mendeley Landslide Susceptibility variables

---

## Quick Start

### 1 — Train the ML model
```bash
cd ml
pip install -r requirements.txt
python data/generate_dataset.py   # creates landslide_dataset.csv
python train.py                   # trains model, saves to models/
```

### 2 — Start the Flask API
```bash
cd ml/api
python app.py                     # runs on http://localhost:5000
```

### 3 — Start the React Dashboard
```bash
cd dashboard
npm install
npm run dev                       # runs on http://localhost:5173
```

---

## API Endpoints

| Method | Path            | Description                           |
|--------|-----------------|---------------------------------------|
| GET    | `/health`       | API + model status                    |
| GET    | `/stats`        | Dashboard summary statistics          |
| GET    | `/region-risks` | Risk data for all NER districts       |
| POST   | `/predict`      | Single-location risk prediction       |
| POST   | `/forecast`     | 24-hour lead-time early warning       |

### Example — Predict
```bash
curl -X POST http://localhost:5000/predict \
  -H "Content-Type: application/json" \
  -d '{"slope":42,"elevation":1200,"curvature":2.1,"aspect":180,
       "precipitation":150,"ndvi":0.15,"soil_moisture":0.7,
       "soil_type":2,"lulc":1,"dist_road":300,"dist_fault":4000}'
```

### Example — Forecast
```bash
curl -X POST http://localhost:5000/forecast \
  -H "Content-Type: application/json" \
  -d '{"latitude":25.25,"longitude":91.73,
       "static_features":{"slope":42,"elevation":1150},
       "alert_threshold":"high"}'
```

---

## Tech Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| ML         | Python · scikit-learn · Random Forest   |
| Data       | Pandas · NumPy · Mendeley Dataset       |
| API        | Flask · Flask-CORS · joblib             |
| Forecast   | Open-Meteo API (free, no key needed)    |
| Frontend   | React 18 · Vite                         |
| Map        | Leaflet · react-leaflet                 |
| Charts     | Chart.js · react-chartjs-2              |
| Backend    | Node.js · Express · JWT · bcrypt        |
| Database   | PostgreSQL                              |

---

## Innovation Highlights

1. **Offline-First Alerts** — device-to-device relay in no-network zones
2. **Dynamic AI Rerouting** — recalculates safe evacuation routes
3. **Risk-Adaptive SMS Alerts** — targeted by severity level
4. **Lead-Time Forecasting** — 24h ahead using live rainfall data
