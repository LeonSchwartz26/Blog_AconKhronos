---
# 用法：hugo new content posts/<目录名>/index.md
#
# 照片和 index.md 放在同一个目录。封面图命名为 cover.jpg：首页缩略图、
# 文章头图和分享预览（og:image）都会自动用它，不用再写 featured_image。
#
# 手机原图带 GPS 坐标等 EXIF 信息，提交前先清掉（保留颜色配置文件）：
#   exiftool -all= -tagsfromfile @ -icc_profile -overwrite_original *.jpg
title: '{{ replace .File.ContentBaseName "-" " " | title }}'
date: {{ .Date }}
draft: true
# 有坐标的文章会出现在首页地图上；不需要的话把整段 location 删掉
location:
  name: ""
  country: ""
  lat:
  lon:
---

第一段会作为首页摘要。
<!--more-->
