#!/usr/bin/env python3
"""
Friends Clips Vault - Server with HTTP 206 Range Streaming & Sync API
Supports iOS Safari, Android Chrome, and PC with real-time clip syncing.
"""

import os
import sys
import json
import mimetypes
import re
from http import HTTPStatus
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Set UTF-8 encoding for Windows console output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MEDIA_DIR = os.path.join(BASE_DIR, "media")
DATA_FILE = os.path.join(BASE_DIR, "clips.json")
SETTINGS_FILE = os.path.join(BASE_DIR, "settings.json")

os.makedirs(MEDIA_DIR, exist_ok=True)

# Initial default clips
DEFAULT_CLIPS = [
    {
        "id": "prelesti-sadizma-1",
        "title": "«ПРЕЛЕСТИ САДИЗМА» #1 — За партой в самолёте и полёт с горы",
        "date": "2026-10-15",
        "friends": ["Blusweek", "anchorite", "Samurai_666", "Tamatyla"],
        "description": "Первый выпуск: рагдолл на трамплине, авария с Мини Купером, пассажиры в багажной тележке и философия о поздравлении бати.",
        "rating": 10,
        "videoUrl": "media/prelesti_sadizma_ep1.mp4",
        "isLocalBlob": False,
        "reactions": {"laugh": 42, "skull": 38, "clown": 6, "fire": 27, "based": 31},
        "duration": "2:13",
        "timestamps": [
            {"time": 5, "label": "«Встань, куда покатился!»"},
            {"time": 22, "label": "ДТП с Мини Купером"},
            {"time": 30, "label": "«Бандитская разборка»"},
            {"time": 56, "label": "«Батю поздравлять — не мем!»"},
            {"time": 65, "label": "«Я вас разъебу»"},
            {"time": 78, "label": "Аэропорт («Пассажиры!»)"},
            {"time": 96, "label": "«За партой в самолёте»"},
            {"time": 107, "label": "Чел из Армении по имени Саша"},
            {"time": 125, "label": "Трактор на трамплине"},
            {"time": 130, "label": "Вы покончили с собой"}
        ]
    }
]

def load_clips():
    if not os.path.exists(DATA_FILE):
        save_clips(DEFAULT_CLIPS)
        return DEFAULT_CLIPS
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            clips = json.load(f)
            # Ensure squad friends are correct on premier clip
            for c in clips:
                if c.get("id") == "prelesti-sadizma-1":
                    c["friends"] = ["Blusweek", "anchorite", "Samurai_666", "Tamatyla"]
            return clips
    except Exception:
        return DEFAULT_CLIPS

def save_clips(clips):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(clips, f, ensure_ascii=False, indent=2)

def load_settings():
    default_settings = {
        "siteTitle": "ПРЕЛЕСТИ САДИЗМА",
        "siteIcon": "🎬",
        "theme": "monochrome",
        "grid": "standard"
    }
    if not os.path.exists(SETTINGS_FILE):
        return default_settings
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default_settings

def save_settings(s):
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False, indent=2)


class RangeHTTPRequestHandler(SimpleHTTPRequestHandler):
    """
    HTTP Request Handler with full HTTP 206 Partial Content (Byte-Range) support
    and API endpoints for syncing clips and uploading videos from PC & Phone.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS and disable caching for API
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    # --------------------------------------------------------------------------
    # GET Requests
    # --------------------------------------------------------------------------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/clips":
            self.send_json(load_clips())
            return

        if path == "/api/settings":
            self.send_json(load_settings())
            return

        if path == "/api/download":
            params = parse_qs(parsed.query)
            rel_path = params.get("path", [""])[0]
            download_name = params.get("name", ["download"])[0]
            if rel_path.startswith("media/"):
                file_path = os.path.join(BASE_DIR, rel_path)
                if os.path.isfile(file_path):
                    ext = os.path.splitext(file_path)[1]
                    if not download_name.endswith(ext):
                        download_name += ext
                    file_size = os.path.getsize(file_path)
                    content_type, _ = mimetypes.guess_type(file_path)
                    content_type = content_type or "application/octet-stream"

                    self.send_response(HTTPStatus.OK)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Length", str(file_size))
                    from urllib.parse import quote
                    safe_filename = quote(download_name)
                    self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{safe_filename}")
                    self.end_headers()
                    with open(file_path, "rb") as f:
                        self.copyfile(f, self.wfile)
                    return
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        # Regular file request - check for Range request
        file_path = self.translate_path(self.path)
        if os.path.isfile(file_path):
            self.serve_file_with_range(file_path)
            return

        super().do_GET()

    # --------------------------------------------------------------------------
    # POST Requests
    # --------------------------------------------------------------------------
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/reaction":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            data = json.loads(body)
            clip_id = data.get("clipId")
            reaction = data.get("reaction")

            clips = load_clips()
            for c in clips:
                if c.get("id") == clip_id:
                    if "reactions" not in c:
                        c["reactions"] = {}
                    c["reactions"][reaction] = c["reactions"].get(reaction, 0) + 1
                    break
            save_clips(clips)
            self.send_json({"success": True, "clips": clips})
            return

        if path == "/api/settings":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            data = json.loads(body)
            save_settings(data)
            self.send_json({"success": True, "settings": data})
            return

        if path == "/api/upload":
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" in content_type:
                self.handle_multipart_upload(content_type)
            else:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode("utf-8")
                clip_data = json.loads(body)
                clips = load_clips()
                clips.insert(0, clip_data)
                save_clips(clips)
                self.send_json({"success": True, "clip": clip_data})
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    # --------------------------------------------------------------------------
    # DELETE Requests
    # --------------------------------------------------------------------------
    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/clips/"):
            clip_id = parsed.path.split("/")[-1]
            clips = load_clips()
            to_delete = [c for c in clips if c.get("id") == clip_id]
            clips = [c for c in clips if c.get("id") != clip_id]
            save_clips(clips)

            for c in to_delete:
                url = c.get("videoUrl", "")
                if url.startswith("media/") and "prelesti_sadizma_ep1" not in url:
                    file_on_disk = os.path.join(BASE_DIR, url)
                    if os.path.isfile(file_on_disk):
                        try:
                            os.remove(file_on_disk)
                        except Exception:
                            pass

            self.send_json({"success": True, "deleted": clip_id})
            return

        self.send_error(HTTPStatus.NOT_FOUND)

    # --------------------------------------------------------------------------
    # Helper: Multipart Upload Handler
    # --------------------------------------------------------------------------
    def handle_multipart_upload(self, content_type):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw_data = self.rfile.read(length)

            # Extract boundary
            boundary_match = re.search(r'boundary=([^\s;]+)', content_type)
            if not boundary_match:
                self.send_error(HTTPStatus.BAD_REQUEST, "Missing boundary")
                return

            boundary = boundary_match.group(1).encode('utf-8')
            parts = raw_data.split(b'--' + boundary)

            metadata = {}
            saved_filename = ""

            for part in parts:
                if not part or part == b'--\r\n' or part == b'--':
                    continue

                if b'\r\n\r\n' not in part:
                    continue

                headers_raw, content = part.split(b'\r\n\r\n', 1)
                headers_text = headers_raw.decode('utf-8', errors='ignore')

                if content.endswith(b'\r\n'):
                    content = content[:-2]

                name_match = re.search(r'name="([^"]+)"', headers_text)
                if not name_match:
                    continue
                field_name = name_match.group(1)

                filename_match = re.search(r'filename="([^"]+)"', headers_text)
                if filename_match:
                    original_name = filename_match.group(1)
                    ext = os.path.splitext(original_name)[1].lower() or ".mp4"
                    prefix = "photo" if ext in {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'} else "clip"
                    safe_name = f"{prefix}_{int(os.times()[4] * 1000)}_{abs(hash(original_name)) % 10000}{ext}"
                    dest_path = os.path.join(MEDIA_DIR, safe_name)
                    with open(dest_path, "wb") as f:
                        f.write(content)
                    saved_filename = f"media/{safe_name}"
                else:
                    metadata[field_name] = content.decode('utf-8', errors='ignore')

            clip_id = metadata.get("id") or f"clip_{int(os.times()[4] * 1000)}"
            friends_str = metadata.get("friends", "Blusweek, anchorite, Samurai_666, Tamatyla")
            friends_list = [f.strip().lstrip("@") for f in friends_str.split(",") if f.strip()]

            timestamps_str = metadata.get("timestamps", "[]")
            try:
                timestamps = json.loads(timestamps_str)
            except Exception:
                timestamps = []

            # Determine if media is photo or video
            check_ext = os.path.splitext(saved_filename or metadata.get("videoUrl", ""))[1].lower()
            is_image = check_ext in {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'} or metadata.get("mediaType") == "photo"

            new_clip = {
                "id": clip_id,
                "title": metadata.get("title", "Новое фото" if is_image else "Новый клип"),
                "date": metadata.get("date", "2026-10-15"),
                "friends": friends_list if friends_list else ["Blusweek", "anchorite", "Samurai_666", "Tamatyla"],
                "description": metadata.get("description", ""),
                "rating": int(metadata.get("rating", 10)),
                "videoUrl": saved_filename or metadata.get("videoUrl", ""),
                "mediaType": "photo" if is_image else "video",
                "isLocalBlob": False,
                "reactions": {"laugh": 1, "skull": 0, "clown": 0, "fire": 0, "based": 0},
                "duration": "📷 Фото" if is_image else metadata.get("duration", "0:30"),
                "timestamps": [] if is_image else timestamps
            }

            clips = load_clips()
            clips.insert(0, new_clip)
            save_clips(clips)

            self.send_json({"success": True, "clip": new_clip})
        except Exception as e:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(e))

    # --------------------------------------------------------------------------
    # Helper: HTTP 206 Partial Content (Byte-Range) Streaming for Safari & Chrome
    # --------------------------------------------------------------------------
    def serve_file_with_range(self, file_path):
        try:
            file_size = os.path.getsize(file_path)
            content_type, _ = mimetypes.guess_type(file_path)
            if not content_type:
                content_type = "video/mp4" if file_path.endswith(".mp4") else "application/octet-stream"

            range_header = self.headers.get("Range")

            if not range_header:
                # No range requested, send entire file
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(file_size))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                with open(file_path, "rb") as f:
                    self.copyfile(f, self.wfile)
                return

            # Range: bytes=START-END
            range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
            if not range_match:
                self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                return

            start = int(range_match.group(1))
            end_str = range_match.group(2)
            end = int(end_str) if end_str else file_size - 1

            if start >= file_size or end >= file_size or start > end:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Content-Range", f"bytes */{file_size}")
                self.end_headers()
                return

            chunk_length = end - start + 1

            self.send_response(HTTPStatus.PARTIAL_CONTENT)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            self.send_header("Content-Length", str(chunk_length))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()

            with open(file_path, "rb") as f:
                f.seek(start)
                bytes_to_send = chunk_length
                buffer_size = 64 * 1024
                while bytes_to_send > 0:
                    read_bytes = min(bytes_to_send, buffer_size)
                    chunk = f.read(read_bytes)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    bytes_to_send -= len(chunk)

        except (ConnectionResetError, BrokenPipeError):
            pass
        except Exception as e:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(e))

    def send_json(self, data, status=HTTPStatus.OK):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_server():
    server_address = ("0.0.0.0", PORT)
    httpd = ThreadingHTTPServer(server_address, RangeHTTPRequestHandler)
    print(f"🔥 Friends Clips Vault Server running on port {PORT}...")
    print(f"   PC:     http://localhost:{PORT}")
    print(f"   Mobile: http://192.168.0.173:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()


if __name__ == "__main__":
    run_server()
