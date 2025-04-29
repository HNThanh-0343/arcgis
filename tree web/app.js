require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/widgets/Legend",
  "esri/widgets/LayerList",
  "esri/widgets/Search",
  "esri/widgets/BasemapGallery",
  "esri/widgets/Home",  
], 
function(Map, MapView, FeatureLayer, Legend, LayerList ,Search ,BasemapGallery,Home) {

  const treeLayer = new FeatureLayer({
    url: "https://gis.eastnegev.org/arcgis/rest/services/trees/FeatureServer/0",
    popupTemplate: {
      title: "{TenCay}",
      content: [{
        type: "fields",
        fieldInfos: [
          { fieldName: "point_Elevation ", label: "Elevation" },
        ]
      }]
    },
  });

  window.treeLayer = treeLayer;
  

  const map = new Map({
    basemap: "streets",
    layers: [treeLayer]
  });

  const view = new MapView({
    container: "viewDiv",
    map: map,

    zoom: 13
  });

  treeLayer.when(() => {
    treeLayer.queryExtent().then((response) => {
      if (response.extent) {
        view.goTo(response.extent.expand(1.2));
      }
    });
  });

  const layerlist = new LayerList({
      view,
      container: "layerlist"
  });

  // Search widget
  const search = new Search({view: view});
  view.ui.add(search , "top-right"),

  // Zoom
  view.ui.move("zoom", "top-right");

  // Home button
  const home = new Home({view: view });
  view.ui.add(home, "top-right");

  // Legend
  const legend = new Legend({ view: view });
  view.ui.add(legend, "bottom-right");

  // Basemap
  const basemapgallery = new BasemapGallery ({  
    view: view,
    container: "basemap", 
  });

  // Layer visibility
  document.getElementById("layerToggle").addEventListener("change", (e) => {
    treeLayer.visible = e.target.checked;
  });

  // full cluster settings in one place
  const clusterConfig = {
    type: "cluster",
    clusterRadius: "80px",
    clusterMinSize: "20px",
    clusterMaxSize: "100px",
    visibilityInfo: {
      type: "scale",
      minScale: 5000
    },
    popupTemplate: {
      title: "{cluster_count} trees",
      content: "This cluster represents {cluster_count} trees"
    },
    labelingInfo: [
      {
        deconflictionStrategy: "none",
        labelPlacement: "center-center",
        labelExpressionInfo: { expression: "$feature.cluster_count" },
        symbol: {
          type: "text",
          color: "#fff",
          haloColor: "#000",
          haloSize: "1px",
          font: { size: "14px", weight: "bold" }
        }
      }
    ]
  };

  // Cluster toggle
  document.getElementById("clusterToggle").addEventListener("change", (e) => {
    treeLayer.featureReduction = e.target.checked
      ? { type: "cluster" }
      : null;

    treeLayer.featureReduction = e.target.checked ? clusterConfig : null;
    treeLayer.refresh();
  });

  // Tree type checkboxes
  const checkboxes = document.querySelectorAll(".treeTypeCheckbox");

  checkboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      const selectedTypes = Array.from(checkboxes)
        .filter(checkbox => checkbox.checked)
        .map(checkbox => `'${checkbox.value}'`);
      
      if (selectedTypes.length === 0) {
        // No type selected, hide everything
        treeLayer.definitionExpression = "1=0";
      } else {
        // Build SQL expression
        treeLayer.definitionExpression = `LoaiCay IN (${selectedTypes.join(",")})`;
      }
    });
  });

  // Search base on tree name or area/road
  view.when(() => {

    const areaSelect = document.getElementById("areaFilter");
    const roadSelect = document.getElementById("roadFilter");
  
    function fillSelect(set, select) {
      select.innerHTML = 
        `<option value="">All ${ select.id === 'areaFilter' ? 'Areas' : 'Roads' }</option>`;
      [...set].sort().forEach(val => {
        const o = document.createElement("option");
        o.value = val;
        o.textContent = val;
        select.appendChild(o);
      });
    }
  
    // 1) Fetch all distinct areas
    treeLayer.queryFeatures({
      where: "1=1",
      outFields: ["DiaChi"],
      returnGeometry: false,
      returnDistinctValues: true,      
      orderByFields: ["DiaChi"]        
    })
    .then(({ features }) => {
      const areas = new Set(features.map(f => f.attributes.diachi).filter(a => a));
      fillSelect(areas, areaSelect);
    })
    .catch(console.error);

    // 2) When area changes, fetch distinct roads in that area
    areaSelect.addEventListener("change", () => {
      const selArea = areaSelect.value;
      const q = {
        where: selArea ? `DiaChi='${selArea.replace(/'/g,"''")}'` : "1=1",
        outFields: ["TenTuyenDu"],
        returnGeometry: false,
        returnDistinctValues: true,
        orderByFields: ["TenTuyenDu"]
      };
      treeLayer.queryFeatures(q)
        .then(({ features }) => {
          const roads = new Set(features.map(f => f.attributes.tentuyendu).filter(r => r));
          fillSelect(roads, roadSelect);
        })
        .catch(console.error);
    });
  
    // Search button
    document.getElementById("treeSearchBtn").addEventListener("click", () => {
      const name = document.getElementById("treeSearchInput").value.trim();
      const road = roadSelect.value;
      const area = areaSelect.value;
  
      // Build an array of individual WHERE clauses
      const clauses = [];
      if (name) {
        const escaped = name.replace(/'/g, "''");
        clauses.push(`LOWER(TenCay) LIKE LOWER('%${escaped}%')`);
      }
      if (road) {
        clauses.push(`TenTuyenDu = '${road.replace(/'/g, "''")}'`);
      }
      if (area) {
        clauses.push(`DiaChi = '${area.replace(/'/g, "''")}'`);
      }
  
      if (clauses.length === 0) {
        alert("Please enter a tree name or select a road/area");
        return;
      }
  
      // Combine all clauses with AND
      const where = clauses.join(" AND ");
  
      // Execute the feature query
      treeLayer.queryFeatures({
        where,
        outFields: ["TenCay", "LoaiCay", "TenTuyenDu", "DiaChi"],
        returnGeometry: true
      })
      .then(result => {
        const container = document.getElementById("treeSearchResults");
        container.innerHTML = ""; // clear old results
  
        if (!result.features.length) {
          container.textContent = "No matches found";
          return;
        }
  
      // Build results table
      const table = document.createElement("table");
      table.border = 1;

      // Create thead and header row
      const thead = table.createTHead();
      const hdr = thead.insertRow();

      const headers = ["Tên Cây", "Loại Cây", "Tuyến Đường", "Khu vực"];
      const fieldNames = ["tencay", "loaicay", "tentuyendu", "diachi"];

      // Track current sort
      let currentSort = { index: -1, asc: true };

      headers.forEach((txt, idx) => {
        const th = document.createElement("th");
        th.textContent = txt;
        th.style.cursor = "pointer";

        // Click to sort
        th.addEventListener("click", () => {
          const tbody = table.tBodies[0];
          const rows = Array.from(tbody.rows);
          const ascending = (currentSort.index === idx) ? !currentSort.asc : true;

          rows.sort((a, b) => {
            const aVal = a.cells[idx].textContent.trim().toLowerCase();
            const bVal = b.cells[idx].textContent.trim().toLowerCase();
            if (aVal < bVal) return ascending ? -1 : 1;
            if (aVal > bVal) return ascending ? 1 : -1;
            return 0;
          });
          // Re-append sorted rows
          rows.forEach(r => tbody.appendChild(r));

          // Update sort state
          currentSort = { index: idx, asc: ascending };

          // Remove arrows from all headers
          Array.from(hdr.cells).forEach(cell => {
            cell.textContent = cell.textContent.replace(/ ▲| ▼/g, "");
          });
          // Add arrow to current header
          th.textContent = `${txt} ${ascending ? "▲" : "▼"}`;
        });

        hdr.appendChild(th);
      });

      // Populate table body
      const tbody = table.createTBody();
      result.features.forEach(feat => {
        const row = tbody.insertRow();
        row.insertCell().textContent = feat.attributes.tencay;
        row.insertCell().textContent = feat.attributes.loaicay;
        row.insertCell().textContent = feat.attributes.tentuyendu;
        row.insertCell().textContent = feat.attributes.diachi;
        row.style.cursor = "pointer";

        // Zoom behavior on row click...
        row.addEventListener("click", () => {
          view.graphics.removeAll();
          view.graphics.add({
            geometry: feat.geometry,
            symbol: {
              type: "simple-marker",
              style: "diamond",
              size: "16px",
              color: "orange",
              outline: { width: 2, color: "white" }
            }
          });
          const center = feat.geometry.extent
            ? feat.geometry.extent.center
            : feat.geometry;
          view.goTo({ center, scale: 2000 });
        });
      });

      // Inject into the page
      container.appendChild(table);

      })
      .catch(err => {
        console.error(err);
        alert("Search error—see console");
      });
    });


    const mainSidebar = document.getElementById("mainSidebar");
    const searchSidebar = document.getElementById("searchSidebar");

    document.getElementById("openSearchMenuBtn").addEventListener("click", () => {
      mainSidebar.style.display = "none";
      searchSidebar.style.display = "block";
    });

    document.getElementById("backToMainBtn").addEventListener("click", () => {
      searchSidebar.style.display = "none";
      mainSidebar.style.display = "block";
    });
  });

  const sidebarToggle = document.getElementById("sidebarToggle");
  const mainSidebar   = document.getElementById("mainSidebar");
  const searchSidebar = document.getElementById("searchSidebar");

  sidebarToggle.addEventListener("click", () => {
    // Toggle both sidebars collapsed/expanded
    mainSidebar.classList.toggle("collapsed");
    searchSidebar.classList.toggle("collapsed");
    // Optionally switch the icon:
    sidebarToggle.textContent = mainSidebar.classList.contains("collapsed")
      ? "☰"    // collapsed: show hamburger
      : "←";   // expanded: show arrow
  });
});

function togglebasemap() {
  const container = document.getElementById("basemapContainer");
  container.style.display = container.style.display === "none" ? "block" : "none";
}