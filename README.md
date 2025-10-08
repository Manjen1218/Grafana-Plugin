# GrafanaPlugins

A **clean-room**, generic example service, reimplementation inspired by Accton company project, with no confidential content.
This project is **not derived from any company code or proprietary software**.
It is designed purely as an open-source educational example.

This repository contains backend, frontend, and source code for custom Grafana plugins.

MY DEMO: [Video](https://drive.google.com/file/d/1h5CH8q7yaH8EqP9QwJSjmo0Yy2w-zU5x/view?usp=drive_link)

## Overview

This repository provides modular components and utilities to support enhanced Grafana dashboards and tooling, including:

- Front-end React apps integrated into Grafana dashboards  
- Back-end services for data fetching, log downloading, and parsing  
- Custom Grafana panels (e.g. Gantt chart)  
- Proxy / middleware configuration for download interception  
- Dashboard utilities such as error analysis, SKU navigation, WO (work order) comparison

---

## Repository Structure
```
Grafana-Plugin/  
├── react-app/ # Front-end app(s) embedded in Grafana dashboards  
├── skumenu-app/ # Sidebar or navigation menu modules  
├── error_analysis_backend/ # API service for error analysis data  
├── gantt-panel/ # Custom Grafana panel (Gantt chart)  
├── grafana-download-service/ # Service to package & download logs  
├── multisndownloader-app/ # Utility to batch-download test data (by serial number)  
├── logviewer-app/ # Log viewing UI + back-end parsing  
├── nginx_grafana_proxy/ # Sample proxy config for intercepting Grafana downloads  
├── wo_comparison/ # Dashboard for comparing multiple work orders  
├── README.md  
└── package.json / root config # (Optional) root-level coordination or bootstrap scripts
```
---

## How to Create Grafana Plugin
There are many ways to start a Grafana plugin, we will be using `npx`. Follow the steps below:

1. Initialize a Grafana Plugin  

To build a custom plugin (panel, app, etc.), you can start with:  
 ```
    $ npx @grafana/create-plugin@latest
 ```
This will prompt you to select the type of plugin (etc `Panel`, `App`, ...) you will be building. After choosing the plugin type, you will name the plugin and finish this initialization process.

2. Integrate Modules  
You may integrate or adapt modules from this repo into your Grafana plugin:   
Front-end apps: Use the React apps as embedded UI components inside Grafana’s side menu or route them via iframes.  
Backend services: Use or adapt the log download / parsing / data APIs to support your dashboards.  
Proxy config: Use the provided Nginx or reverse proxy setup to intercept native Grafana asset downloads (e.g. CSV/JSON blobs) and reroute them through your custom backend.  
Custom panels: The gantt-panel folder demonstrates how to build a panel with custom behavior (e.g. text selectable in tooltips, no drag/zoom).  

3. Run & Test Locally  
Each folder should have its own package.json (or build setup). From within a module folder:
```
npm install
npm run dev     # or npm start
```

You can run modules side by side (e.g. backend + frontend), proxy via Nginx, and connect to a Grafana instance for testing.
