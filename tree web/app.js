require([
  "esri/Map",
  "esri/views/MapView",
  "esri/layers/FeatureLayer",
  "esri/widgets/Legend",
  "esri/widgets/LayerList",
  "esri/widgets/Search",
  "esri/widgets/BasemapGallery",
  "esri/widgets/Home",
  "esri/Viewpoint",
  "esri/widgets/ScaleBar",
  "esri/Graphic",
  "esri/geometry/geometryEngine",
  "esri/smartMapping/renderers/pieChart"

], 
function(Map, MapView, FeatureLayer, Legend, LayerList ,Search , BasemapGallery, Home, Viewpoint, ScaleBar, Graphic, geometryEngine, pieChart) {

  const serviceUrl = "https://gishue.hue.gov.vn/server/rest/services/BanDoDuLich_HueCIT/CayXanh_CQ_DuLich/FeatureServer";

  // 1) Instantiate both sub‑layers
  const layer0 = new FeatureLayer({
    url: `${serviceUrl}/0`,
    outFields: ["*"],
    title: "Cây xanh",
  });

  const layer1 = new FeatureLayer({
    url: `${serviceUrl}/1`,
    outFields: ["*"],
    title: "Di tích",
  });

  // 2) Put them on the map
  const map = new Map({
    basemap: "streets-navigation-vector",
    layers: [ layer1, layer0 ]
  });

  const view = new MapView({
    container: "viewDiv",
    center: [ 0, 0 ], 
    map: map,
  });

  // 3) A helper to build popupTemplate from fields
  function applyDynamicPopup(layer, titleField, keepFields) {
    layer.outFields = ["*"];
    layer.when(() => {
      // Only include the fields you’ve specified
      const fieldInfos = layer.fields
        .filter(f => keepFields.includes(f.name))
        .map(f => ({
          fieldName: f.name,
          label:     f.alias,
          visible:   true
        }));
  
      layer.popupTemplate = {
        title: `{${titleField}}`,
        content: [{
          type: "fields",
          fieldInfos
        }]
      };
    });
  }
  

  // 4) Apply dynamic popups to both
  applyDynamicPopup(layer0, "TenCay", ["tencay", "tentuyendu", "diachi"]);
  applyDynamicPopup(layer1, "TenDiTich", ["tenditich", "dientich"]);  
  
  const treeLayer = layer0;
  const heritageLayer = layer1;
  window.treeLayer = treeLayer; // for debugging
  let selectedFeature = null;  // to store the selected tree for buffering
  let pieClusterConfig = null; // to store the pie chart config for clustering

  //Once the layer is loaded, get its full extent…
  treeLayer.when(() => treeLayer.queryExtent())
    .then(({ extent }) => {
      const padded = extent.expand(1.2);

      // …zoom the view there…
      return view.goTo(padded).then(() => padded);
    })
    .then(padded => {
      // …and *then* create the Home widget with that extent
      const home = new Home({
        view,
        viewpoint: new Viewpoint({ targetGeometry: padded })
      });
      view.ui.add(home, "top-right");
    })
    .catch(err => console.error(err));

  const layerlist = new LayerList({
      view,
      container: "layerlist"  
  });

  // Search widget
  const search = new Search({view: view});
  view.ui.add(search , "top-right"),

  // Zoom
  view.ui.move("zoom", "top-right");

  // Legend
  const legend = new Legend({ view: view });
  view.ui.add(legend, "bottom-right");

  // Scale bar
  const scaleBar = new ScaleBar({
    view: view,
    unit: "metric" // metric or imperial
  });
  view.ui.add(scaleBar, "bottom-right");

  // Basemap
  const basemapgallery = new BasemapGallery ({  
    view: view,
    container: "basemap", 
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

  view.when(() => {

    // Create a search input and button
    const areaSelect = document.getElementById("areaFilter");
    const roadSelect = document.getElementById("roadFilter");

    // Fill the area select with distinct areas
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
          selectedFeature = feat;  // Store selected feature for later use
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

    // allow selecting a tree by clicking on it for buffering
    view.on("click", async (event) => {
      const hit = await view.hitTest(event, { include: treeLayer });
      if (hit.results.length) {
        const g = hit.results[0].graphic;
        view.graphics.removeAll();
        view.graphics.add(g);
        selectedFeature = g;    // <— save it for buffering
      }
    });

    // BUFFER TOOL
    document.getElementById("bufferBtn").addEventListener("click", () => {
      if (!selectedFeature) {
        alert("Please click a tree on the map first.");
        return;
      }
      const dist = parseFloat(document.getElementById("bufferDistance").value);
      if (!(dist > 0)) {
        alert("Enter a valid distance in meters.");
        return;
      }

      // create a buffer geometry
      const bufferGeom = geometryEngine.geodesicBuffer(
        selectedFeature.geometry, dist, "meters"
      );

      // draw buffer + the tree
      view.graphics.removeAll();
      view.graphics.add(new Graphic({
        geometry: bufferGeom,
        symbol: {
          type: "simple-fill",
          color: [0,0,0,0.1],
          outline: { color:[0,0,0,0.6], width:2 }
        }
      }));
      view.graphics.add(selectedFeature);

      // zoom to buffer
      view.goTo(bufferGeom.extent.expand(1.2));

      // optional: highlight all trees inside
      treeLayer.queryFeatures({
        geometry: bufferGeom,
        spatialRelationship: "intersects",
        outFields: ["*"],
        returnGeometry: true
      }).then(({ features })=>{
        features.forEach(f=> view.graphics.add(new Graphic({
          geometry: f.geometry,
          symbol: {
            type: "simple-marker",
            style: "circle",
            size: "10px",
            color: "green",
            outline:{ color:"white",width:1 }
          }
        })));
      });
    });

    // 1) Build the pie-chart renderer for clustering
    pieChart.createRendererForClustering({
      layer: treeLayer,
      view: view,
      shape: "donut"               
    })
    .then(({ renderer, fields }) => {

      // assemble your cluster config
      pieClusterConfig = {
        type: "cluster",
        clusterRadius: "80px",
        renderer, 
        popupTemplate: {
          title: "{cluster_count} trees",
          content: [{
            type: "media",
            mediaInfos: [{
              type: "pie-chart",
              caption: "Tree type distribution",
              value: { fields: fields.map(f => f.name) }
            }]
          }]
        }
      };

      // 2) Now that pieClusterConfig is valid, wire up the checkbox
      const chk = document.getElementById("clusterToggle");
      chk.disabled = false;     
      chk.addEventListener("change", () => {
        treeLayer.featureReduction = chk.checked
          ? pieClusterConfig    // turn clustering ON
          : null;               // turn clustering OFF
        treeLayer.refresh();    
      });

      // OPTIONAL: if you want clusters by default:
      // chk.checked = true;
      // treeLayer.featureReduction = pieClusterConfig;
    })
    .catch(err => {
      console.error("Failed to create pieChart renderer:", err);
    });
    

  });
  
  // Sidebar toggle
  const sidebarToggle = document.getElementById("sidebarToggle");
  const mainSidebar   = document.getElementById("mainSidebar");
  const searchSidebar = document.getElementById("searchSidebar");

  sidebarToggle.addEventListener("click", () => {
    // Toggle both sidebars collapsed/expanded
    mainSidebar.classList.toggle("collapsed");
    searchSidebar.classList.toggle("collapsed");
    // Optionally switch the icon:
    sidebarToggle.textContent = mainSidebar.classList.contains("collapsed")
      ? "☰" 
      : "←";   
  });
  
});
// toggle the visibility of the basemap gallery
function togglebasemap() {
  const container = document.getElementById("basemapContainer");
  container.style.display = container.style.display === "none" ? "block" : "none";
}