# GrafanaPlugins

This repository contains backend, frontend, and source code for custom Grafana plugins.

DEMO [Video](https://drive.google.com/file/d/1Q_NFriSFPqUjvDaOvSNTBLASRj-AE40s/view?usp=drivesdk)
[Powerpoint](https://drive.google.com/file/d/1YWPod_hQDawSS-ZtEsZr415sCYvMYHFj/view?usp=drivesdk)

Within this repository, we have the following:
1. [accton-react-app](./accton-react-app/)
2. [accton-skumenu-app](./accton-skumenu-app/)
3. [err_analysis_backend](./error_analysis_backend/)
4. [gantt-panel](./gantt-panel/)
5. [grafana-download-service](./grafana-download-service/)
6. [accton-multisndownloader-app](./accton-multisndownloader-app/)
7. [accton-logviewer-app](./accton-logviewer-app/)
8. [nginx_grafana_proxy](./nginx_grafana_proxy/)
9. [wo_comparison](./wo_comparison/)


### [accton-react-app](./accton-react-app/)
This directory contains source code for the `Error Analysis` webpage linked in Grafana dashboard. 

### [accton-skumenu-app](./accton-skumenu-app/)
This directory contains source code for the `SKU Menu` sidebar menu in Grafana dashbaord. This menu is then further linked to [`SKU Level Metrics`](http://61.219.235.16:8136/d/2a2a2c67-e2cc-4523-8b5a-615e1cdb5e5d/sku-level?) webpage.

### [err_analysis_backend](./error_analysis_backend/)
This directory contains the backend [`server.js`](./error_analysis_backend/server.js) that is responsible for the fetching of data shown in the `Error Analysis` webpage.

### [gantt-panel](./gantt-panel/)
This directory contains source code for the Gantt Chart used in `JIG Heatmap` page in Grafana dashboard. Unlike the Gantt Charts used in other dashboard pages, this modified version of Gantt Chart has the original drag/zoom functionality removed and enabled select/copy of text in tooltip.

### [grafana-download-service](./grafana-download-service/)
This directory contains the backend [`server.js`](./grafana-download-service/server.js) that is responsible for the fetching and downloading of raw logs compressed into `.tar.gz` format. It also hold multiple backend services for Grafana plugins such as fetching data and parsing logs for Log Viewer.

### [accton-multisndownloader-app](./accton-multisndownloader-app/)
This directory contains source code for the multi-sn downloader plugin. User can choose different input types such as .csv, .txt, .xlsx, or just plain text with multiple serial numbers that they would like to download records for. Currently, this service only supports serial numbers from the same SKU. This plugin offers dynamic file selection where user can choose by test status / test type.

### [accton-logviewer-app](./accton-logviewer-app/)
This directory contains source code for Log Viewer where it displays parsed log with failed/passed test cases. It shows the failed test cases with highlighted error messages for readability. It offers automatic scroll-to-line to enhance user experience and debugging.

### [nginx_grafana_proxy](./nginx_grafana_proxy/)
This directory holds the nginx configuration for Grafana Dashboard. Nginx is set up to hijack Grafana-native download csv. It will capture the BLOB created from downloading and rename the BLOB to our preference.

### [wo_comaparison](./wo_comparison/)
This directory contains the React/Typescript version of a new dashboard functionality in development: Multi Work Order Comparison. This intends to support users who may want to compare the yield rates, error distribution, and JIG / RPI temperatures across multiple (no definitive number) work orders. Once basic functionalities and UI are complete, it will be built into a plugin installed in Grafana.

## How to Create Grafana Plugin
There are many ways to start a Grafana plugin, we will be using `npx`. Follow the steps below:
1.  ```
    $ npx @grafana/create-plugin@latest
    ```
    This will prompt you to select the type of plugin (etc `Panel`, `App`, ...) you will be building. After choosing the plugin type, you will name the plugin and finish this initialization process.
2. After this initial step, you can continue to format the structure and implement your plugin.
