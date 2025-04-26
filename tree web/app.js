require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/widgets/Legend",
  "esri/widgets/LayerList",
  "esri/widgets/Search",
  "esri/widgets/BasemapGallery",
], 
function(Map, MapView, FeatureLayer, Legend, LayerList ,Search, BasemapGallery) {

  const treeLayer = new FeatureLayer({
    url: "https://gishue.hue.gov.vn/server/rest/services/BanDoDuLich_HueCIT/CayXanh_CQ_DuLich/FeatureServer/0",
    popupTemplate: {
      title: "{TenCay}",
      content: [{
        type: "fields",
        fieldInfos: [
          { fieldName: "TenCay", label: "Tên Cây" },
          { fieldName: "TenTuyenDu", label: "Tuyến Đường"},
          { fieldName: "MoTa", label: "Mô tả" },
          { fieldName: "DiaChi", label: "Khu vực"}
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
    center: [107.6, 16.47],
    zoom: 13
  });

  const layerlist = new LayerList({
      view,
      container: "layerlist"
  });
  
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
  
    // ▶️ 1) Fetch all distinct areas
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

    // ▶️ 2) When area changes, fetch *distinct* roads in that area
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
        const hdr = table.createTHead().insertRow();
        const headers = ["Tên Cây", "Loại Cây", "Tuyến Đường", "Khu vực"];
        const fieldNames = ["tencay", "loaicay", "tentuyendu", "diachi"];

        let sortState = {}; // Track sort order per column

        headers.forEach((txt, idx) => {
          const th = document.createElement("th");
          th.textContent = txt;
          th.style.cursor = "pointer";
          hdr.appendChild(th);

          th.addEventListener("click", () => {
            const field = fieldNames[idx];
            const rows = Array.from(table.tBodies[0]?.rows || []);
            const ascending = !sortState[field]; // toggle

            rows.sort((a, b) => {
              const valA = a.cells[idx].textContent.trim().toLowerCase();
              const valB = b.cells[idx].textContent.trim().toLowerCase();
              if (valA < valB) return ascending ? -1 : 1;
              if (valA > valB) return ascending ? 1 : -1;
              return 0;
            });

            rows.forEach(row => table.tBodies[0].appendChild(row));
            sortState = { [field]: ascending }; // Only one column sorted at a time
          });
        });

        // Populate rows
        const tbody = table.createTBody();
        result.features.forEach(feat => {
          const row = tbody.insertRow();
          row.insertCell().textContent = feat.attributes.tencay;
          row.insertCell().textContent = feat.attributes.loaicay;
          row.insertCell().textContent = feat.attributes.tentuyendu;
          row.insertCell().textContent = feat.attributes.diachi;
          row.style.cursor = "pointer";

          // Zoom to the tree
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
            const centerPoint = feat.geometry.extent
              ? feat.geometry.extent.center
              : feat.geometry;
            view.goTo({
              center: centerPoint,
              scale: 2000    // ~1:2 000 scale on every basemap
            });
          });
        });

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

});

function togglebasemap() {
  const container = document.getElementById("basemapContainer");
  container.style.display = container.style.display === "none" ? "block" : "none";
}
