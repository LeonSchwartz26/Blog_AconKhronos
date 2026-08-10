/* 旅行地图：读取页面里的 JSON 数据，渲染 Leaflet 点位，并与文章卡片联动。
   数据由 layouts/_partials/home-map.html 以 <script type="application/json"> 注入。 */
(function () {
  "use strict";

  /* 点位色取自 CSS 的 --map-accent，配色改动收敛在 custom.css 一处 */
  function accent() {
    var v = getComputedStyle(document.documentElement)
      .getPropertyValue("--map-accent")
      .trim();
    return v || "#9c4a33";
  }

  /* 白描边让点在淡色底图上有一圈呼吸感，不至于糊进地面 */
  function baseStyle() {
    return {
      className: "travel-map-marker",
      color: "#fff",
      opacity: 1,
      fillColor: accent(),
      radius: 6,
      weight: 2,
      fillOpacity: 0.9
    };
  }

  function activeStyle() {
    return Object.assign(baseStyle(), { radius: 9, weight: 3, fillOpacity: 1 });
  }

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

    var map = L.map(container, {
      scrollWheelZoom: false,
      /* 不锁死的话可以一直缩到世界地图周围全是灰底 */
      minZoom: 2,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1
    });

    /* Leaflet 默认前缀是「🇺🇦 Leaflet」，一面国旗 emoji 在这里太抢眼；
       OSM 与 CARTO 的署名是使用条款要求的，保留。 */
    map.attributionControl.setPrefix("");

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        subdomains: "abcd",
        maxZoom: 19,
        noWrap: true,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
          '&copy; <a href="https://carto.com/attributions">CARTO</a>'
      }
    ).addTo(map);

    var markersById = Object.create(null);
    var bounds = [];

    places.forEach(function (place) {
      var marker = L.circleMarker([place.lat, place.lon], baseStyle()).addTo(map);
      /* autoPan 关掉：setActive 里已经有 panTo，两者同时动会互相拉扯 */
      marker.bindPopup(buildPopup(place), {
        className: "travel-map-popup-box",
        autoPan: false,
        closeButton: true
      });
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
        markersById[id].setStyle(baseStyle());
      });
    }

    function setActive(id) {
      clearActive();
      var marker = markersById[id];
      if (!marker) return;
      marker.setStyle(activeStyle());
      map.panTo(marker.getLatLng(), { animate: true, duration: 0.4 });
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
