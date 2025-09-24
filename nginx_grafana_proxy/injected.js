(function () {
  const OriginalBlob = window.Blob;
  const originalCreateObjectURL = URL.createObjectURL;

  const trackedBlobs = new WeakMap();
  const urlToFilename = new Map();

  // Define your dashboard names list here:
  const dashboardList = ['timely-dashboard', 'jig-temperature-distribution-sku-level', 
    'jig-rpi-temperature-distribution', 'pt-fail-distribution-sku-level', 
    'pt-yield-sku-level', 'miscellaneous', 'jig-heatmap'];

  // Override Blob constructor to track CSV blobs
  window.Blob = function (blobParts, options) {
    const type = options?.type || '';
    const windowPath = window.location.pathname.split('/')[1] || '';
    const newBlob = new OriginalBlob(blobParts, options);

    if (type.includes('csv') && windowPath == 'd') {

      // Determine dashboard name from URL param "dashboard" (adjust if needed)
      const dashboardName = getDashboardNameFromUrl().toLowerCase();

      // Decide time range based on dashboardName
      let fromDate, toDate, timeString;
      if (dashboardList.includes(dashboardName)) {
        const range = getTimeRangeFromUrl();
        fromDate = parseTime(range.from);
        toDate = parseTime(range.to);

        const fromStr = formatTimeLocal(fromDate);
        const toStr = formatTimeLocal(toDate);
        timeString = `${fromStr}_${toStr}`;
      } else {
        // Use current time
        timeString = formatTimeLocal(new Date());
      }

      function findPanelTitleFromButton(button) {
        let el = button;
        for (let i = 0; i < 20; i++) { // walk up max 20 levels just in case
          if (!el) break;
          if (el.hasAttribute && el.hasAttribute('aria-label')) {
            const ariaLabel = el.getAttribute('aria-label');
            // Example aria-label: "Drawer title Inspect: RPI Temperature Distribution by JIG"
            const match = ariaLabel.match(/Inspect:\s*(.+)/);
            if (match && match[1]) {
              // Clean string for filename (replace unwanted chars)
              return match[1].trim().replace(/[^\w-]/g, '_');
            }
          }
          el = el.parentElement;
        }
        return 'panel'; // fallback
      }

      // Usage inside your code:
      const el = document.activeElement; // your button
      const panelTitle = findPanelTitleFromButton(el);
      const customFilename = `${panelTitle}_${timeString}.csv`;

      trackedBlobs.set(newBlob, customFilename);
    }

    return newBlob;
  };
  window.Blob.prototype = OriginalBlob.prototype;

  // Patch createObjectURL to associate blob URLs with filenames
  URL.createObjectURL = function (blob) {
    const filename = trackedBlobs.get(blob);

    if (filename && blob.type.includes('csv')) {
      const url = originalCreateObjectURL(blob);
      urlToFilename.set(url, filename);
      return url;
    }
    return originalCreateObjectURL(blob);
  };

  // Helper to forcibly update download attribute if href matches tracked blob URL
  function tryFixDownload(el) {
    if (!(el instanceof HTMLAnchorElement)) return;

    const href = el.href;
    if (!href) return;

    const filename = urlToFilename.get(href);
    if (filename && el.download !== filename) {
      el.download = filename;
    }
  }

  // Patch setAttribute to catch 'href' and 'download'
  const originalSetAttribute = HTMLAnchorElement.prototype.setAttribute;
  HTMLAnchorElement.prototype.setAttribute = function (name, value) {
    const result = originalSetAttribute.call(this, name, value);
    if (name.toLowerCase() === 'href' || name.toLowerCase() === 'download') {
      tryFixDownload(this);
    }
    return result;
  };

  // Patch property setters for 'href' and 'download' for maximum coverage
  function patchProperty(proto, propName) {
    const desc = Object.getOwnPropertyDescriptor(proto, propName);
    if (!desc || !desc.configurable) return;

    Object.defineProperty(proto, propName, {
      get() {
        return desc.get.call(this);
      },
      set(value) {
        desc.set.call(this, value);
        tryFixDownload(this);
      },
      configurable: true,
      enumerable: true,
    });
  }

  patchProperty(HTMLAnchorElement.prototype, 'href');
  patchProperty(HTMLAnchorElement.prototype, 'download');

  // Helper functions same as before
  function getTimeRangeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return {
      from: params.get('from'),
      to: params.get('to'),
    };
  }

  // Added to get dashboard name from URL param "dashboard"
  function getDashboardNameFromUrl() {
    const parts = window.location.pathname.split('/');
    return parts[3] || '';
  }

  function parseTime(timeStr) {
    if (!timeStr) return new Date();

    const now = new Date();

    if (/^\d+$/.test(timeStr)) {
      const timestamp = Number(timeStr);
      return timestamp > 1e12 ? new Date(timestamp) : new Date(timestamp * 1000);
    }

    const match = /^now(?:-(\d+)([smhdwMy]))?$/.exec(timeStr);
    if (match) {
      const amount = parseInt(match[1] || '0', 10);
      const unit = match[2] || 'ms';

      const unitMs = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000,
        M: 30 * 24 * 60 * 60 * 1000,
        y: 365 * 24 * 60 * 60 * 1000,
      };

      const offsetMs = (unitMs[unit] || 0) * amount;
      return new Date(now.getTime() - offsetMs);
    }

    const parsed = Date.parse(timeStr);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }

    return new Date();
  }

  function formatTimeLocal(date) {
    if (!(date instanceof Date)) return '';
    
    // Pad helper for leading zeros
    const pad = (n) => (n < 10 ? '0' + n : n);

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1); // Months are 0-based
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    // Format similar to your existing pattern, but local time:
    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
  }
})();
