# RailMitra (MVP)

Starter scaffold for the RailMitra app.

Quick start

1. Install dependencies:

```bash
cd railmitra
npm install
```

2. Set MongoDB URI and run:

```bash
set MONGODB_URI=mongodb://localhost:27017/railmitra
npm run dev
```

3. Start server and open the app:

```bash
set MONGODB_URI=mongodb://localhost:27017/railmitra
npm run dev
# then open http://localhost:3000 in your browser
```



The backend will now serve the frontend from `frontend/`. Open `http://localhost:3000` to see the index page, or navigate to `/passenger.html`, `/assistant.html`, or `/admin.html`.

This scaffold implements the passenger booking flow and basic backend routes.

Seeding sample data

To populate sample assistants and bookings for quick testing run:

```bash
npm run seed
```

This creates two assistants (one verified) and three bookings (pending + accepted) so you can test the assistant and admin flows immediately.

Remove demo data

If you want to clear demo/seeded data and start fresh run:

```bash
npm run clear-seed
```

This will delete all documents in the `Assistant` and `Booking` collections. Use with care.

Admin & Assistant UI

- Open `frontend/admin.html` to view assistants and bookings and approve/reject assistants.
- Open `frontend/assistant.html` to register an assistant, view pending bookings, accept/reject, and verify OTP.

Notes

- No authentication is implemented yet; this is an MVP flow for learning and prototyping.
- To test locally, run the server and open the HTML files in your browser (or serve `frontend/` from a static server).
