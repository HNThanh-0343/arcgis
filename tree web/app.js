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

  // Search
  view.when(() => {
    const areaSelect = document.getElementById("areaFilter");
    const roadSelect = document.getElementById("roadFilter");
  
    // helper to build <option> list from a Set of strings
    function fillSelect(set, select) {
      select.innerHTML = `<option value="">All ${ select.id === 'areaFilter' ? 'Areas' : 'Roads' }</option>`;
      [...set].sort().forEach(val => {
        const o = document.createElement("option");
        o.value = val;
        o.textContent = val;
        select.appendChild(o);
      });
    }
  
    // 1) On load: fetch every feature’s area & road in one go
    treeLayer.queryFeatures({
      where: "1=1",
      outFields: ["DiaChi", "TenTuyenDu"],
      returnGeometry: false
    })
    .then(({ features }) => {
      const areas = new Set();
      const roads = new Set();
    
      features.forEach(f => {
        const area = f.attributes["diachi"];
        const road = f.attributes["tentuyendu"];
    
        // Only add if it's a valid, non-empty string
        if (typeof area === "string" && area.trim()) {
          areas.add(area.trim());
        }
        if (typeof road === "string" && road.trim()) {
          roads.add(road.trim());
        }
      });
    
      fillSelect(areas, document.getElementById("areaFilter"));
      fillSelect(roads, document.getElementById("roadFilter"));
    })
    .catch(err => console.error("Filter load error:", err));    
  
    // 2) When Area changes, reload only the roads in that area
    areaSelect.addEventListener("change", () => {
      const selArea = areaSelect.value;
  
      // if no area selected, reload ALL roads
      if (!selArea) {
        // trigger the initial “all roads” load again
        treeLayer.queryFeatures({
          where: "1=1",
          outFields: ["TenTuyenDu"],
          returnGeometry: false
        })
        .then(({ features }) => {
          const roads = new Set(features.map(f => f.attributes.tentuyendu).filter(r => r));
          fillSelect(roads, roadSelect);
        });
        return;
      }
  
      // otherwise fetch only roads where DiaChi = selArea
      treeLayer.queryFeatures({
        where: `DiaChi = '${selArea.replace(/'/g, "''")}'`,
        outFields: ["TenTuyenDu"],
        returnGeometry: false
      })
      .then(({ features }) => {
        const roads = new Set(features.map(f => f.attributes.tentuyendu).filter(r => r));
        fillSelect(roads, roadSelect);
      })
      .catch(err => console.error("Error loading roads for area:", err));
    });
    
  
      // Search button function
      document.getElementById("treeSearchBtn").addEventListener("click", () => {
        const name = document.getElementById("treeSearchInput").value;
        const road = document.getElementById("roadFilter").value;
        const area = document.getElementById("areaFilter").value;

        const clauses = [];

        if (name) {
          const escaped = name.replace(/'/g, "''");
          clauses.push(`LOWER(TenCay) LIKE LOWER('%${escaped}%')`);
        }
        if (road) {
          clauses.push(`TenTuyenDu = '${road.replace(/'/g,"''")}'`);
        }
        if (area) {
          clauses.push(`DiaChi = '${area.replace(/'/g,"''")}'`);
        }

        const where = clauses.length ? clauses.join(" AND ") : "1=1";

        treeLayer.queryFeatures({
          where,
          outFields: ["TenCay","LoaiCay","TenTuyenDu","DiaChi"],
          returnGeometry: true
        })
        .then(result => {
          const container = document.getElementById("treeSearchResults");
          container.innerHTML = "";
          if (!result.features.length) {
            container.textContent = "No matches found";
            return;
          }

          // build table
          const table = document.createElement("table");
          table.border = 1;
          const hdr = table.insertRow();
          ["Tên Cây","Loại Cây","Tuyến Đường","Khu vực"].forEach(txt => {
            const th = document.createElement("th");
            th.textContent = txt;
            hdr.appendChild(th);
          });

          result.features.forEach(feat => {
            console.log("Feature attributes:", feat.attributes);

            const row = table.insertRow();
            row.insertCell().textContent = feat.attributes.tencay;
            row.insertCell().textContent = feat.attributes.loaicay;
            row.insertCell().textContent = feat.attributes.tentuyendu;
            row.insertCell().textContent = feat.attributes.diachi;
            row.style.cursor = "pointer";

            row.addEventListener("click", () => {
              view.graphics.removeAll();
              feat.symbol = {
                type: "simple-marker",
                style: "diamond",
                size: "16px",
                color: "orange",
                outline: { width: 2, color: "white" }
              };
              view.graphics.add(feat);

              // zoom to feature
              if (feat.geometry.extent) {
                view.goTo(feat.geometry.extent.expand(2));
              } else {
                view.goTo({ center: feat.geometry, zoom: 16 });
              }
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