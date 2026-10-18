
# Airbnb Room Type Predictor

**Every stay has a pattern.** A machine learning project that predicts an Airbnb listing's room type (*Entire home/apt*, *Private room*, *Shared room*) from its location, price, reviews and availability, with an animated single-page frontend.

> **Live demo:** https://nyc-room-type-prediction-2-6ue0.onrender.com

> **Repository:** https://github.com/burhan-arshad/nyc-room-type-prediction

Independent student project. Not affiliated with Airbnb. It uses historical public data, not live listings.

## How it works

```
Listing features → Frontend validation → FastAPI → Scikit-learn pipeline → Prediction response → Results visualization
```

1. The browser validates ten inputs and posts them as JSON to `/predict`.
2. FastAPI validates them again with Pydantic and builds a one-row Pandas DataFrame.
3. A Joblib-loaded Scikit-learn pipeline returns the predicted class and class probabilities.
4. The frontend validates the response and draws every class from the `Classes` and `Probability` arrays as the **Model Class Probabilities** chart.

## Model

- **Data:** [New York City Airbnb Open Data](https://www.kaggle.com/datasets/dgomonov/new-york-city-airbnb-open-data) (`AB_NYC_2019.csv`, Kaggle).
- **Target:** `room_type`.
- **Features (10):** `neighbourhood_group`, `neighbourhood`, `latitude`, `longitude`, `price`, `minimum_nights`, `number_of_reviews`, `reviews_per_month`, `calculated_host_listings_count`, `availability_365`.
- **Cleaning:** dropped `id`, `name`, `host_id`, `host_name`, `last_review`; filled missing `reviews_per_month` with 0; capped `price` and `minimum_nights` at the 99th percentile.
- **Preprocessing:** median imputation, Yeo-Johnson transform and scaling for skewed numeric columns; median imputation and scaling for coordinates; most-frequent imputation and one-hot encoding for categories.
- **Models compared:** Logistic Regression, Decision Tree, Random Forest (5-fold CV, accuracy and macro F1, `class_weight="balanced"`).
- **Final model:** Random Forest tuned with `RandomizedSearchCV` (10 iterations, 3-fold, macro F1) on an 80/20 stratified split.
- **Results:** add your own numbers from the notebook here: `Accuracy: ___`, `Macro F1: ___`.

Output probabilities are model estimates, not calibrated confidence scores.

## API

| Method | Path       | Purpose        |
|--------|------------|----------------|
| GET    | `/`        | Health check   |
| POST   | `/predict` | Predict a room type |

Request body:

```json
{
  "neighbourhood_group": "Manhattan",
  "neighbourhood": "Midtown",
  "latitude": 40.7549,
  "longitude": -73.984,
  "price": 150,
  "minimum_nights": 2,
  "number_of_reviews": 45,
  "reviews_per_month": 1.5,
  "calculated_host_listings_count": 3,
  "availability_365": 200
}
```

Response shape (values are illustrative):

```json
{
  "Predicted_room_type": "Private room",
  "Classes": ["Entire home/apt", "Private room", "Shared room"],
  "Probability": [0.15, 0.75, 0.10]
}
```

## Frontend features

- One-screen predictor: headline and form side by side, with an animated skyline and drifting colour background.
- Borough and neighbourhood suggestions that follow each other; picking a neighbourhood fills in its borough.
- Inline validation, demo preset, duplicate-submit protection, copyable results.
- Real API status indicator, driven by a request to `GET /`.
- Animated headline, probability bars and percentage count-up. Honors `prefers-reduced-motion`.

## Project structure

```
nyc-room-type-prediction/

├── main.py
├── Model_Pipeline.pkl
├── requirements.txt
├── index.html
├── style.css
├── script.js
├── airbnb_room_type.ipynb
└── README.md
```

Adjust the paths to match your repository.

## Run locally

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend (second terminal)
cd frontend
python -m http.server 5500
```

For local testing only, temporarily set `API_BASE_URL` in `frontend/script.js` to your local API address (printed by uvicorn). Set it back to the deployed HTTPS URL before you commit.

## Deploy

1. **Backend:** deploy the FastAPI app to a Python host (Render, Railway, etc.). Use the same scikit-learn version the model was trained with.
2. **API URL:** in `frontend/script.js`, set `const API_BASE_URL = "https://your-api.example.com";` (no trailing slash).
3. **Frontend:** deploy the `frontend/` folder to Vercel, Netlify or GitHub Pages. There is no build step.
4. **CORS:** change `allow_origins=["*"]` in the backend to your frontend domain, for example `["https://your-site.vercel.app"]`.
5. **Verify:** open the site, confirm the status light is green, load the demo data and predict.

## Limitations

- Trained on 2019 New York City data; it does not generalize to other cities or years.
- Suggestions list the neighbourhoods in that dataset. Typing another name is accepted, and the encoder ignores categories it has not seen.
- Predictions are not verified for production use.

## Author

**Burhan Arshad**, Computer Science Student | AI & Machine Learning Developer

