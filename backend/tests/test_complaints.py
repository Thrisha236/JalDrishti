import io

import pytest
from PIL import Image

from app import config
from app.auth import create_token

URL = "/api/v1/complaints"
FORM = {"category": "LOW_WATER", "service_area_id": "sa-north", "description": "Very low water since morning"}


def jpeg_with_gps(size=(800, 600)) -> bytes:
    """A JPEG carrying EXIF camera and GPS tags, like a real phone photo."""
    img = Image.new("RGB", size, (90, 110, 130))
    exif = Image.Exif()
    exif[0x010F] = "DemoPhone"  # Make
    exif[0x0112] = 6  # Orientation: rotate 90°
    gps = exif.get_ifd(0x8825)
    gps[1], gps[2] = "N", (17.0, 23.0, 6.0)  # latitude
    gps[3], gps[4] = "E", (78.0, 29.0, 12.0)  # longitude
    out = io.BytesIO()
    img.save(out, "JPEG", exif=exif)
    return out.getvalue()


def submit(client, headers, photo: bytes | None = None, name="pipe.jpg", **form):
    files = {"photo": (name, photo, "image/jpeg")} if photo is not None else None
    return client.post(URL, data={**FORM, **form}, files=files, headers=headers)


def test_citizen_submits_with_photo_and_gets_2048(client, as_citizen):
    r = submit(client, as_citizen, jpeg_with_gps())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["public_code"] == "2048"
    assert body["is_simulated"] is False
    assert body["location"]["precision"] == "approx_1km"
    assert len(body["media"]) == 1 and body["media"][0]["file"] is None  # storage key never leaves the server
    analysis = body["image_analysis"][0]
    assert analysis["is_simulated"] is True and analysis["engine"] == "simulated-v0"
    assert "not an ai diagnosis" in analysis["disclaimer"].lower()


def test_stored_photo_has_no_metadata_and_is_upright(client, as_citizen):
    submit(client, as_citizen, jpeg_with_gps())
    stored = list(config.UPLOAD_DIR.glob("*.jpg"))
    assert len(stored) == 1
    with Image.open(stored[0]) as img:
        assert img.format == "JPEG"
        assert len(img.getexif()) == 0  # no EXIF at all, so no GPS
        assert img.size == (600, 800)  # rotated according to the original orientation tag


def test_large_photos_are_downscaled(client, as_citizen):
    submit(client, as_citizen, jpeg_with_gps((4000, 3000)))
    with Image.open(next(config.UPLOAD_DIR.glob("*.jpg"))) as img:
        assert max(img.size) <= config.MAX_PHOTO_SIDE


def test_photo_is_optional_and_codes_skip_used_numbers(client, as_citizen):
    first = submit(client, as_citizen).json()
    second = submit(client, as_citizen, category="DIRTY_WATER").json()
    assert (first["public_code"], second["public_code"]) == ("2048", "2050")  # 2049 belongs to another villager
    assert first["media"] == [] and first["image_analysis"] == []


def test_duplicate_report_is_rejected(client, as_citizen):
    assert submit(client, as_citizen).status_code == 201
    r = submit(client, as_citizen)
    assert r.status_code == 409
    assert "#2048" in r.json()["detail"]


def test_location_can_be_withheld(client, as_citizen):
    body = submit(client, as_citizen, share_location="false").json()
    assert body["location"] == {"x": None, "y": None, "precision": "not_shared"}


@pytest.mark.parametrize(
    ("payload", "name"),
    [
        (b"just some text pretending to be a photo", "pipe.jpg"),  # wrong content, right extension
        (b"\xff\xd8\xff\xe0" + b"\x00" * 200, "pipe.jpg"),  # JPEG signature but not a real image
        (b"<svg xmlns='http://www.w3.org/2000/svg'/>", "pipe.svg"),
    ],
)
def test_non_images_are_rejected(client, as_citizen, payload, name):
    r = submit(client, as_citizen, payload, name=name)
    assert r.status_code == 415
    assert not config.UPLOAD_DIR.exists() or not list(config.UPLOAD_DIR.glob("*"))


def test_oversized_photo_is_rejected(client, as_citizen, monkeypatch):
    big = jpeg_with_gps()
    monkeypatch.setattr(config, "MAX_PHOTO_BYTES", len(big) - 1)
    assert submit(client, as_citizen, big).status_code == 413
    assert not config.UPLOAD_DIR.exists() or not list(config.UPLOAD_DIR.glob("*"))


def test_description_length_is_capped(client, as_citizen):
    assert submit(client, as_citizen, description="x" * 201).status_code == 422


def test_only_citizens_submit_and_only_in_their_village(client, as_citizen, as_gp):
    assert submit(client, as_gp).status_code == 403
    assert submit(client, as_citizen, service_area_id="sa-kondapur-main").status_code == 422


def test_photo_access_is_role_checked(client, as_citizen, as_gp, as_officer):
    media_id = submit(client, as_citizen, jpeg_with_gps()).json()["media"][0]["id"]
    url = f"/api/v1/media/{media_id}"

    owner = client.get(url, headers=as_citizen)
    assert owner.status_code == 200 and owner.headers["content-type"] == "image/jpeg"
    assert "no-store" in owner.headers["cache-control"]
    assert client.get(url, headers=as_gp).status_code == 200
    assert client.get(url, headers=as_officer).status_code == 200

    neighbour = {"Authorization": f"Bearer {create_token('usr-citizen-north-2')}"}
    assert client.get(url, headers=neighbour).status_code == 404
    assert client.get(url).status_code == 401
    assert client.get(url, headers={"Authorization": "Bearer forged.token"}).status_code == 401


def test_complaint_detail_hidden_from_other_citizens(client, as_citizen):
    submit(client, as_citizen)
    neighbour = {"Authorization": f"Bearer {create_token('usr-citizen-north-2')}"}
    assert client.get("/api/v1/complaints/2048", headers=as_citizen).status_code == 200
    assert client.get("/api/v1/complaints/2048", headers=neighbour).status_code == 404


def test_my_complaints_and_gp_inbox(client, as_citizen, as_gp):
    submit(client, as_citizen, jpeg_with_gps())
    mine = client.get("/api/v1/complaints/mine", headers=as_citizen).json()
    assert [c["public_code"] for c in mine] == ["2048"]
    assert mine[0]["description"] == "Very low water since morning"
    inbox = client.get("/api/v1/complaints", headers=as_gp).json()
    assert {c["public_code"] for c in inbox} == {"2048", "2049", "2051"}
    assert client.get("/api/v1/complaints/mine", headers=as_gp).status_code == 403
    assert client.get("/api/v1/complaints", headers=as_citizen).status_code == 403


def test_public_snapshot_redacts_private_fields(client, as_citizen):
    submit(client, as_citizen, jpeg_with_gps())
    live = next(c for c in client.get("/api/v1/snapshot").json()["story"]["complaints"] if c["public_code"] == "2048")
    assert live["description"] is None
    assert live["media"][0]["file"] is None


def test_writes_are_audited(client, as_citizen, session):
    from app import models as m

    submit(client, as_citizen, jpeg_with_gps())
    rows = session.query(m.AuditLog).all()
    assert [(r.action, r.entity, r.entity_id) for r in rows] == [("create", "complaint", "2048")]
    assert "description" not in (rows[0].details or {})


def test_demo_reset_restores_the_seed(client, as_citizen):
    submit(client, as_citizen, jpeg_with_gps())
    assert client.post("/api/v1/demo/reset", headers=as_citizen).json()["status"] == "reset"
    codes = [c["public_code"] for c in client.get("/api/v1/snapshot").json()["story"]["complaints"]]
    assert codes == ["2049", "2051"]
    assert not list(config.UPLOAD_DIR.glob("*.jpg"))


def test_demo_login_rejects_unknown_roles(client):
    assert client.post("/api/v1/auth/demo-login", json={"role": "technician"}).status_code == 400
