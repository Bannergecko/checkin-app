[README.md](https://github.com/user-attachments/files/27185001/README.md)
# Greater Lathrop Chamber - Member Check-In

A simple, offline-capable check-in application for iPad browsers.

## Features

- Collect member name, phone, and email
- Associate check-ins with events
- Works offline (saves to device storage)
- Export data as JSON or CSV for CRM import
- Add/remove custom events
- View recent check-ins

## Setup

1. Open `index.html` in Safari on your iPad
2. Tap the Share button and scroll to "Add to Home Screen"
3. Now it launches as a full-screen app!

## Usage

1. Select an event from the dropdown
2. Enter member information
3. Tap "Check In"
4. Data is saved locally

## Exporting Data

Open "Admin & Data" section and choose:
- **Export JSON** - For developers/API integration
- **Export CSV** - Opens in Excel, imports to most CRMs

## Future CRM Integration

The app stores data in localStorage with key `lathrop_checkins`. When ready to integrate with a CRM, you can:
1. Add an API endpoint to send data directly
2. Continue using CSV export for manual import
3. Build a sync button to push to your CRM

## Tech

- HTML5 + JavaScript
- Tailwind CSS (via CDN)
- localStorage for persistence
- No server required - runs entirely in browser
