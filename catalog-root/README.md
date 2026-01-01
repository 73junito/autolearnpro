# Catalog Template

This folder contains a catalog template layout for course content and a student dashboard.

Structure (visual):

```
/catalog-root
│
├── /student-dashboard/            ← [DASHBOARD]
│   ├── /components/               ← Components (TSX/JS)
│   ├── /styles/                   ← Stylesheets (CSS/SCSS)
│   ├── /scripts/                  ← JS/TS utilities
│   ├── layout.tsx                 ← Main dashboard layout
│   └── index.tsx                  ← Entry page
│
├── /modules/                      ← [MODULES/WEEKS]
│   ├── /week-01-introduction/
│   │   ├── activities.md
│   │   ├── knowledge-check.md
│   │   ├── lecture.md
│   │   └── overview.md
│   └── ...
│
├── /lessons/                       ← [LESSONS OUTSIDE MODULES]
│
├── /assessments/                   ← [ASSESSMENTS]
│
├── /public/                        ← [STATIC ASSETS]
│
├── DEPLOYMENT_APPENDIX.md          ← [OPS & DEPLOYMENT DOCS]
├── OPS_QUICK_REFERENCE.md          ← [OPS ONE-LINER COMMANDS]
└── README.md
```

Legend:
- `[DASHBOARD]` → Student dashboard code and UI components
- `[MODULES/WEEKS]` → Course content organized per week
- `[LESSONS OUTSIDE MODULES]` → Standalone lessons
- `[ASSESSMENTS]` → Labs, exams, practice tests
- `[STATIC ASSETS]` → Images, styles, favicon, public files

Benefits: clear separation of dashboard, content, and assets; scales for multi-week catalogs; ops docs discoverable.
