/* 旅行地图：读取页面里的 JSON 数据，用 MapLibre GL 渲染 OpenFreeMap 底图和点位，并与文章卡片联动。
   数据由 layouts/_partials/home-map.html 以 <script type="application/json"> 注入。

   容器里默认就有一份地点列表（无 JS / 无 WebGL / 底图被拦截时可见）。
   只有地图真正加载成功后才加上 .is-live：隐藏列表、显示地图。 */
(function () {
  "use strict";

  /* OpenFreeMap：免费、免 API key、无 cookie 的开源矢量瓦片服务。
     positron 是浅灰底图，和原先 CARTO light_all 是同一套设计。 */
  var STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

  /* 界面文字本地化，键名见 maplibre-gl 的 defaultLocale */
  var LOCALE = {
    "AttributionControl.ToggleAttribution": "显示/隐藏版权信息",
    "CooperativeGesturesHandler.WindowsHelpText": "按住 Ctrl 并滚动鼠标滚轮来缩放地图",
    "CooperativeGesturesHandler.MacHelpText": "按住 ⌘ 并滚动鼠标滚轮来缩放地图",
    "CooperativeGesturesHandler.MobileHelpText": "用两根手指移动地图",
    "Map.Title": "旅行地图",
    "NavigationControl.ZoomIn": "放大",
    "NavigationControl.ZoomOut": "缩小",
    "Popup.Close": "关闭"
  };

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

  /* 点位是 DOM 元素而不是画在 canvas 上：样式全在 CSS（--map-accent），
     并且 MapLibre 会给它加上 role=button / tabindex，键盘可以直接 Tab 到点位、回车打开气泡。
     外层元素的 transform 由 MapLibre 用来定位，所以放大效果只能做在内层 .travel-map-dot 上。 */
  function buildMarkerElement(place) {
    var el = document.createElement("div");
    el.className = "travel-map-marker";
    el.setAttribute("aria-label", place.placeName);
    var dot = document.createElement("span");
    dot.className = "travel-map-dot";
    el.appendChild(dot);
    return el;
  }

  function init(container) {
    var places = readPlaces(container);
    if (!places.length) return;
    /* 地图库没加载成功（被拦截、网络错误）时保留地点列表 */
    if (typeof maplibregl === "undefined") return;

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* 地图画在单独的子元素里，这样容器里的地点列表不会被 MapLibre 覆盖或清空 */
    var canvasHost = document.createElement("div");
    canvasHost.className = "travel-map-canvas";
    container.appendChild(canvasHost);

    var bounds = new maplibregl.LngLatBounds();
    places.forEach(function (place) {
      bounds.extend([place.lon, place.lat]);
    });

    var map;
    try {
      map = new maplibregl.Map({
        container: canvasHost,
        style: STYLE_URL,
        locale: LOCALE,
        bounds: bounds,
        /* 只有一个点时 fitBounds 会放到最大，用 maxZoom 兜住 */
        fitBoundsOptions: { padding: 40, maxZoom: 10 },
        minZoom: 1,
        /* 不锁边界的话可以把世界地图拖出视野，四周全是空白。
           经度不要写满 ±180：maplibre-gl 5.24.1 在那种情况下初始化会抛
           "Cannot read properties of null"，±179 实测正常。 */
        maxBounds: [[-179, -80], [179, 84]],
        renderWorldCopies: false,
        /* 页面滚动经过地图时不劫持滚轮；手机上单指照常滚动页面，双指才拖地图 */
        cooperativeGestures: true,
        /* 平面旅行图不需要旋转和倾斜 */
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false
      });
    } catch (err) {
      /* 浏览器不支持或禁用了 WebGL */
      console.error("travel-map: 地图初始化失败", err);
      canvasHost.remove();
      return;
    }

    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

    var markersByUrl = Object.create(null);
    places.forEach(function (place) {
      var el = buildMarkerElement(place);
      /* focusAfterOpen 关掉：卡片 hover/focus 时会打开气泡，不能把焦点从卡片抢走 */
      var popup = new maplibregl.Popup({
        className: "travel-map-popup-box",
        offset: 12,
        maxWidth: "260px",
        focusAfterOpen: false
      }).setDOMContent(buildPopup(place));

      var marker = new maplibregl.Marker({ element: el })
        .setLngLat([place.lon, place.lat])
        .setPopup(popup)
        .addTo(map);

      markersByUrl[place.url] = { marker: marker, popup: popup, el: el };
    });

    var live = false;
    var failed = false;

    function giveUp() {
      if (failed) return;
      failed = true;
      map.remove();
      canvasHost.remove();
    }

    /* 底图数据源整体加载失败（例如被广告/隐私拦截列表挡住）时，
       退回地点列表，而不是留一张只有点位、没有底图的空白地图。
       单张瓦片失败（e.tile 存在）属于偶发情况，不处理。 */
    map.on("error", function (e) {
      if (!live && e.sourceId && !e.tile) giveUp();
    });

    map.once("load", function () {
      if (failed) return;
      live = true;
      container.classList.add("is-live");
      bindCards();
    });

    var activeUrl = null;

    function clearActive() {
      if (!activeUrl) return;
      var entry = markersByUrl[activeUrl];
      entry.el.classList.remove("is-active");
      if (entry.popup.isOpen()) entry.popup.remove();
      activeUrl = null;
    }

    function setActive(url) {
      if (url === activeUrl) return;
      clearActive();
      var entry = markersByUrl[url];
      if (!entry) return;
      activeUrl = url;
      entry.el.classList.add("is-active");
      var lngLat = entry.marker.getLngLat();
      /* 只有点位不在视野内才平移，避免上下浏览文章列表时地图来回晃 */
      if (!map.getBounds().contains(lngLat)) {
        map.panTo(lngLat, { animate: !reduceMotion, duration: 400 });
      }
      if (!entry.popup.isOpen()) entry.marker.togglePopup();
    }

    /* 文章卡片 ←→ 地图点位联动。键盘 focus 同样触发，不只是鼠标。 */
    function bindCards() {
      document.querySelectorAll("[data-map-id]").forEach(function (card) {
        var url = card.getAttribute("data-map-id");
        if (!markersByUrl[url]) return;
        card.addEventListener("mouseenter", function () { setActive(url); });
        card.addEventListener("focusin", function () { setActive(url); });
        card.addEventListener("mouseleave", function () {
          /* 鼠标离开但键盘焦点还在卡片里时保持高亮 */
          if (!card.contains(document.activeElement)) clearActive();
        });
        card.addEventListener("focusout", function (e) {
          /* 焦点只是在同一张卡片内部移动（标题 → 继续阅读）时不清除 */
          if (!card.contains(e.relatedTarget)) clearActive();
        });
      });
    }
  }

  document.querySelectorAll("[data-travel-map]").forEach(init);
})();
