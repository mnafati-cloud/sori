#!/usr/bin/env python3
"""Paid API generation, explicit ids + bounded batch. No publication; stdlib only.
Preserves HTTPS_PROXY and platform CA trust. Never prints API keys or raw API errors.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

HERE = Path(__file__).resolve().parent
API = "https://api.openai.com/v1/images/edits"


def multipart(fields, reference):
    boundary = "sori-" + uuid.uuid4().hex
    chunks = []
    for key, value in fields.items():
        chunks.append((f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n").encode())
    chunks.extend([
        (f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="style-reference.png"\r\nContent-Type: image/png\r\n\r\n').encode(),
        reference, f"\r\n--{boundary}--\r\n".encode()
    ])
    return b"".join(chunks), "multipart/form-data; boundary=" + boundary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ids", required=True, help="Comma-separated inventory ids (max 10)")
    parser.add_argument("--limit", type=int, default=3)
    parser.add_argument("--model", default="gpt-image-1")
    parser.add_argument("--execute", action="store_true", help="Actually call the paid API; otherwise dry run")
    args = parser.parse_args()
    ids = args.ids.split(",")
    if not 1 <= len(ids) <= args.limit <= 10 or len(set(ids)) != len(ids):
        parser.error("Provide 1–10 distinct ids within --limit")
    inventory = json.loads((HERE / "inventory.json").read_text())
    items = {it["id"]: it for it in inventory["items"]}
    if any(i not in items for i in ids):
        parser.error("Unknown inventory id")
    if any(items[i]["status"] == "approved" for i in ids):
        parser.error("Already approved: change status to queued explicitly to request a replacement")
    print(f"{len(ids)} image(s), model={args.model}, quality=medium, size=1024x1024; no automatic retries or publication")
    if not args.execute:
        print("Dry run: no API request. Use --execute to spend API credits.")
        return
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        parser.error("OPENAI_API_KEY missing: set it securely in the environment / GitHub Actions secret")
    reference = (HERE / "style-reference.png").read_bytes()
    run = HERE / "candidates" / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8])
    run.mkdir(parents=True)
    for iid in ids:
        prompt = (HERE / "style.md").read_text() + "\n\nSubject:\n" + items[iid]["subject"]
        fields = {"model": args.model, "prompt": prompt, "n": "1", "size": "1024x1024", "quality": "medium"}
        body, content_type = multipart(fields, reference)
        req = urllib.request.Request(API, data=body, headers={"Authorization": "Bearer " + key, "Content-Type": content_type})
        try:
            with urllib.request.urlopen(req, timeout=240) as response:
                result = json.load(response)
        except urllib.error.HTTPError as exc:
            raise SystemExit(f"Generation stopped: HTTP {exc.code}. Check API access/billing. Completed candidates remain on disk; no retry.") from None
        except (urllib.error.URLError, TimeoutError):
            raise SystemExit("Generation stopped: network/timeout. A timed-out request may have been billed; inspect before retrying.") from None
        image = base64.b64decode(result["data"][0]["b64_json"], validate=True)
        source = run / (iid + ".png")
        source.write_bytes(image)
        receipt = {"id": iid, "model": args.model, "endpoint": API, "parameters": fields,
                   "referenceSha256": hashlib.sha256(reference).hexdigest(), "usage": result.get("usage"),
                   "createdAt": datetime.now(timezone.utc).isoformat()}
        receipt_file = run / (iid + ".json")
        receipt_file.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        subprocess.run(["node", str(HERE / "pipeline.mjs"), "import", iid, str(source), "openai-api:" + args.model, str(receipt_file)], check=True)
        print(f"Candidate prepared: {iid}. Inspect and approve separately.")


if __name__ == "__main__":
    main()
