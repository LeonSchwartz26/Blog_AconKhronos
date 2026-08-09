/* 旅行地图：读取页面里的 JSON 数据，渲染 Leaflet 点位，并与文章卡片联动。
   数据由 layouts/_partials/home-map.html 以 <script type="application/json"> 注入。 */
(function () {
  "use strict";

  var NORMAL = { radius: 6, weight: 2, fillOpacity: 0.8 };
  var ACTIVE = { radius: 10, weight: 3, fillOpacity: 1 };

  function readPlaces(container) {
    var payload = document.querySelector(
      '[data-travel-map-for="' + container.id + '"]'
    );
    if (!payload) return [];
    try {
      return JSON.parse(payload.textContent) || [];
    } catch (err) {
      console.error("travel-map: 数据解析失败", err);
      return [];
    }
  }

  /* 用 DOM API 构建气泡，避免把标题/地名当 HTML 拼接 */
  function buildPopup(place) {
    var wrap = document.createElement("div");
    wrap.className = "travel-map-popup";

    var name = document.createElement("strong");
    name.textContent = place.placeName;
    wrap.appendChild(name);

    [place.country, place.date].forEach(function (line) {
      if (!line) return;
      wrap.appendChild(document.createElement("br"));
      var span = document.createElement("span");
      span.textContent = line;
      wrap.appendChild(span);
    });

    wrap.appendChild(document.createElement("br"));
    var link = document.createElement("a");
    link.href = place.url;
    link.textContent = place.title ? "打开：" + place.title : "打开文章";
    wrap.appendChild(link);

    return wrap;
  }

  function init(container) {
    var places = readPlaces(container);
    if (!places.length) return;

    var map = L.map(container, { scrollWheelZoom: false });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    var markersById = Object.create(null);
    var bounds = [];

    places.forEach(function (place) {
      var marker = L.circleMarker([place.lat, place.lon], NORMAL).addTo(map);
      marker.bindPopup(buildPopup(place));
      markersById[place.id] = marker;
      bounds.push([place.lat, place.lon]);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40] });
    } else {
      map.setView(bounds[0], 10);
    }

    function clearActive() {
      Object.keys(markersById).forEach(function (id) {
        markersById[id].setStyle(NORMAL);
      });
    }

    function setActive(id) {
      clearActive();
      var marker = markersById[id];
      if (!marker) return;
      marker.setStyle(ACTIVE);
      map.panTo(marker.getLatLng());
      marker.openPopup();
    }

    /* 文章卡片 ←→ 地图点位联动。键盘 focus 同样触发，不只是鼠标。 */
    document.querySelectorAll("[data-map-id]").forEach(function (card) {
      var id = card.getAttribute("data-map-id");
      if (!markersById[id]) return;
      card.addEventListener("mouseenter", function () { setActive(id); });
      card.addEventListener("focusin", function () { setActive(id); });
      card.addEventListener("mouseleave", clearActive);
      card.addEventListener("focusout", clearActive);
    });
  }

  document.querySelectorAll("[data-travel-map]").forEach(init);
})();
