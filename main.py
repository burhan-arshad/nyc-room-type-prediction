from fastapi import FastAPI
import pandas as pd
from pydantic import BaseModel, Field
import joblib

model=joblib.load('Model_Pipeline.pkl')

COLUMNS=['neighbourhood_group',
    'neighbourhood', 'latitude', 'longitude', 'room_type', 'price',
    'minimum_nights', 'number_of_reviews', 'last_review',
    'reviews_per_month', 'calculated_host_listings_count',
    'availability_365']

class Features(BaseModel):
    latitude: float = Field(..., ge=-90, le=90, description="Latitude coordinate")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude coordinate")
    price: float = Field(..., gt=0, description="Price per night, must be positive")
    minimum_nights: int = Field(..., ge=1, le=365, description="Minimum nights required for booking")
    number_of_reviews: int = Field(..., ge=0, description="Total number of reviews")
    reviews_per_month: float = Field(..., ge=0, description="Average reviews per month")
    calculated_host_listings_count: int = Field(..., ge=0, description="Number of listings by this host")
    availability_365: int = Field(..., ge=0, le=365, description="Days available out of 365")
    neighbourhood_group: str = Field(..., min_length=1, description="Borough or neighbourhood group")
    neighbourhood: str = Field(..., min_length=1, description="Specific neighbourhood name")
    

app=FastAPI()

@app.get('/')
def greet():
    return {"message": "Hello, World!"}

@app.post('/predict')
def predict(features: Features):
    row=pd.DataFrame(features.dict(), columns=COLUMNS, index=[0])
    prediction = model.predict(row)
    return {"prediction": prediction[0]}
