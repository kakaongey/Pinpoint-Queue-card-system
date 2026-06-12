# Repository Structure

```txt
.
├── docker-compose.yml
├── frontend
│   ├── index.html
│   ├── css
│   │   └── home.css
│   └── js
│       └── home.js
└── pinpoint-backend
    ├── .gitignore
    ├── package-lock.json
    ├── package.json
    ├── server.js
    ├── middleware
    │   └── auth.js
    ├── models
    │   ├── Ticket.js
    │   └── user.js
    └── routes
        ├── auth.js
        └── tickets.js
```

Note: The main HTML entry point is currently at `frontend/index.html` (not at the repo root).

