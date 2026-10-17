"""Database tables. Timestamps and dates are stored as ISO-8601 strings (with their +05:30 offset)
so SQLite and PostgreSQL behave the same; `ord` keeps the seed's list order stable."""

from typing import Any

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Config(Base):
    __tablename__ = "config"
    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)


class RiskConfig(Base):
    """Versioned risk-scoring rules. Exactly one version is active; old versions are kept so every score
    can be traced to the rules that produced it, and a change can be rolled back."""

    __tablename__ = "risk_configs"
    version: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[str]
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str] = mapped_column(Text)
    config: Mapped[Any] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean)


class Village(Base):
    __tablename__ = "villages"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    name: Mapped[str]
    lgd_code: Mapped[str]
    district: Mapped[str]
    state: Mapped[str]
    is_mock: Mapped[bool] = mapped_column(Boolean)


class ServiceArea(Base):
    __tablename__ = "service_areas"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    village_id: Mapped[str] = mapped_column(ForeignKey("villages.id"))
    name: Mapped[str]
    sujal_gaon_id: Mapped[str | None]
    sujal_gaon_note: Mapped[str | None]
    household_count: Mapped[int]
    household_count_source: Mapped[str]
    polygon: Mapped[Any] = mapped_column(JSON)
    is_mock: Mapped[bool] = mapped_column(Boolean)


class Scheme(Base):
    __tablename__ = "schemes"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    village_id: Mapped[str] = mapped_column(ForeignKey("villages.id"))
    name: Mapped[str]
    sujalam_bharat_id: Mapped[str]
    is_mock: Mapped[bool] = mapped_column(Boolean)


class SchemeServiceArea(Base):
    __tablename__ = "scheme_service_areas"
    scheme_id: Mapped[str] = mapped_column(ForeignKey("schemes.id"), primary_key=True)
    service_area_id: Mapped[str] = mapped_column(ForeignKey("service_areas.id"), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)


class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    code: Mapped[str]
    type: Mapped[str]
    name: Mapped[str]
    scheme_id: Mapped[str] = mapped_column(ForeignKey("schemes.id"))
    service_area_id: Mapped[str] = mapped_column(ForeignKey("service_areas.id"))
    geometry: Mapped[Any] = mapped_column(JSON)
    is_mock: Mapped[bool] = mapped_column(Boolean)


class PipelineProfile(Base):
    __tablename__ = "pipeline_profiles"
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    material: Mapped[str]
    material_source: Mapped[str]
    diameter_mm: Mapped[int | None]
    install_date: Mapped[str]
    install_date_source: Mapped[str]
    length_m: Mapped[int]
    pressure_per_flow_drop_pct: Mapped[float | None] = mapped_column(Float)
    trend_source: Mapped[str]


class Inspection(Base):
    __tablename__ = "inspections"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    date: Mapped[str]
    method: Mapped[str]
    corrosion_grade: Mapped[int | None]
    notes: Mapped[str] = mapped_column(Text)
    is_mock: Mapped[bool] = mapped_column(Boolean)


class Repair(Base):
    __tablename__ = "repairs"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    date: Mapped[str]
    failure_type: Mapped[str]
    notes: Mapped[str] = mapped_column(Text)
    incident_id: Mapped[str | None]
    is_mock: Mapped[bool] = mapped_column(Boolean)


class SensorNode(Base):
    __tablename__ = "sensor_nodes"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    code: Mapped[str]
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    location: Mapped[str]
    power: Mapped[str]
    is_simulated: Mapped[bool] = mapped_column(Boolean)
    # Updated by telemetry ingest (Stage 6); empty until a node first reports.
    last_seen_at: Mapped[str | None] = mapped_column(default=None)
    battery_v: Mapped[float | None] = mapped_column(Float, default=None)


class Sensor(Base):
    __tablename__ = "sensors"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    node_id: Mapped[str] = mapped_column(ForeignKey("sensor_nodes.id"))
    kind: Mapped[str]
    position: Mapped[str | None]
    unit: Mapped[str]
    baseline: Mapped[float] = mapped_column(Float)
    band_low: Mapped[float] = mapped_column(Float)
    band_high: Mapped[float] = mapped_column(Float)
    is_simulated: Mapped[bool] = mapped_column(Boolean)


class Reading(Base):
    """One sensor value. quality_flag marks values outside the physical range of the sensor kind;
    they are kept (a broken sensor is itself evidence) but never treated as normal data."""

    __tablename__ = "readings"
    __table_args__ = (Index("ix_readings_sensor_ts", "sensor_id", "ts"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sensor_id: Mapped[str] = mapped_column(ForeignKey("sensors.id"))
    ts: Mapped[str]
    value: Mapped[float] = mapped_column(Float)
    quality_flag: Mapped[str] = mapped_column(String, default="ok")  # ok | out_of_range


class SupplySchedule(Base):
    __tablename__ = "supply_schedules"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ord: Mapped[int] = mapped_column(Integer)
    service_area_id: Mapped[str] = mapped_column(ForeignKey("service_areas.id"))
    days: Mapped[str]
    windows: Mapped[Any] = mapped_column(JSON)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    username: Mapped[str | None] = mapped_column(String, unique=True)  # None = cannot sign in (e.g. technician)
    password_hash: Mapped[str | None] = mapped_column(String, default=None)  # never leaves the server
    role: Mapped[str]
    display_name: Mapped[str]
    village_id: Mapped[str | None] = mapped_column(ForeignKey("villages.id"))
    service_area_id: Mapped[str | None] = mapped_column(ForeignKey("service_areas.id"))
    village_ids: Mapped[Any | None] = mapped_column(JSON)
    language: Mapped[str]
    is_mock: Mapped[bool] = mapped_column(Boolean)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str]  # WATER_SERVICE or EQUIPMENT_HEALTH
    rule_code: Mapped[str]
    severity: Mapped[str]
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    sensor_id: Mapped[str | None] = mapped_column(ForeignKey("sensors.id"))
    service_area_id: Mapped[str] = mapped_column(ForeignKey("service_areas.id"))
    raised_at: Mapped[str]
    details: Mapped[Any | None] = mapped_column(JSON)
    text: Mapped[str] = mapped_column(Text)
    is_simulated: Mapped[bool] = mapped_column(Boolean)
    # Set by the rules engine when the condition has been false for the clear window (Stage 7).
    cleared_at: Mapped[str | None] = mapped_column(default=None)


class Complaint(Base):
    __tablename__ = "complaints"
    public_code: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    citizen_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    service_area_id: Mapped[str] = mapped_column(ForeignKey("service_areas.id"))
    category: Mapped[str]
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str]
    location: Mapped[Any] = mapped_column(JSON)  # coarse only: {"x", "y", "precision": "approx_1km"}
    linked_asset_id: Mapped[str | None] = mapped_column(ForeignKey("assets.id"))
    incident_code: Mapped[str | None] = mapped_column(ForeignKey("incidents.code"), default=None)  # set when grouped into an incident
    is_simulated: Mapped[bool] = mapped_column(Boolean)


class ComplaintMedia(Base):
    __tablename__ = "complaint_media"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    complaint_code: Mapped[str] = mapped_column(ForeignKey("complaints.public_code"))
    file: Mapped[str | None]
    note: Mapped[str | None] = mapped_column(Text)
    exif_stripped: Mapped[bool] = mapped_column(Boolean)


class ImageAnalysis(Base):
    __tablename__ = "image_analysis"
    media_id: Mapped[str] = mapped_column(ForeignKey("complaint_media.id"), primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    engine: Mapped[str]
    is_simulated: Mapped[bool] = mapped_column(Boolean)
    observation_code: Mapped[str]
    message: Mapped[str] = mapped_column(Text)
    disclaimer: Mapped[str] = mapped_column(Text)


class Incident(Base):
    __tablename__ = "incidents"
    code: Mapped[str] = mapped_column(String, primary_key=True)
    ord: Mapped[int] = mapped_column(Integer)
    is_history: Mapped[bool] = mapped_column(Boolean)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    service_area_id: Mapped[str] = mapped_column(ForeignKey("service_areas.id"))
    opened_at: Mapped[str]
    closed_at: Mapped[str | None]
    status: Mapped[str | None]
    priority: Mapped[str | None]
    evidence_score: Mapped[float | None] = mapped_column(Float)
    evidence_score_note: Mapped[str | None]
    probable_cause: Mapped[str | None] = mapped_column(Text)
    affected_estimate: Mapped[int | None]
    affected_basis: Mapped[str | None]
    uncertainties: Mapped[Any | None] = mapped_column(JSON)
    sensor_health: Mapped[str | None]
    summary: Mapped[str | None] = mapped_column(Text)
    is_mock: Mapped[bool | None] = mapped_column(Boolean)
    is_simulated: Mapped[bool | None] = mapped_column(Boolean)


class IncidentEvidence(Base):
    __tablename__ = "incident_evidence"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ord: Mapped[int] = mapped_column(Integer)
    incident_code: Mapped[str] = mapped_column(ForeignKey("incidents.code"))
    type: Mapped[str]
    ref: Mapped[Any] = mapped_column(JSON)
    contribution: Mapped[float] = mapped_column(Float)
    text: Mapped[str] = mapped_column(Text)


class MaintenanceTask(Base):
    __tablename__ = "maintenance_tasks"
    code: Mapped[str] = mapped_column(String, primary_key=True)
    incident_code: Mapped[str] = mapped_column(ForeignKey("incidents.code"))
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    assignee_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    due_at: Mapped[str]
    is_simulated: Mapped[bool] = mapped_column(Boolean)


class TaskUpdate(Base):
    __tablename__ = "task_updates"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ord: Mapped[int] = mapped_column(Integer)
    task_code: Mapped[str] = mapped_column(ForeignKey("maintenance_tasks.code"))
    status: Mapped[str]
    at: Mapped[str]
    note: Mapped[str | None] = mapped_column(Text)


class Verification(Base):
    __tablename__ = "verifications"
    incident_code: Mapped[str] = mapped_column(ForeignKey("incidents.code"), primary_key=True)
    method: Mapped[str]  # sensor_window | manual | citizen
    rule: Mapped[str] = mapped_column(Text)
    result: Mapped[str]  # VERIFIED_RESTORED | RESTORATION_UNCONFIRMED | RESOLVED_UNVERIFIED
    verified_at: Mapped[str | None]
    is_simulated: Mapped[bool] = mapped_column(Boolean)


class VerificationWindow(Base):
    __tablename__ = "verification_windows"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ord: Mapped[int] = mapped_column(Integer)
    incident_code: Mapped[str] = mapped_column(ForeignKey("verifications.incident_code"))
    start: Mapped[str]
    end: Mapped[str]
    result: Mapped[str]
    tail_pressure_mean_bar: Mapped[float] = mapped_column(Float)


class Notification(Base):
    """Scripted citizen notifications for the story. complaint_code is a plain reference (no foreign key)
    because the story's complaint #2048 is created live during the demo."""

    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ord: Mapped[int] = mapped_column(Integer)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    complaint_code: Mapped[str]
    at: Mapped[str]
    message_key: Mapped[str]


class AuditLog(Base):
    """Every write is recorded: who, what, when. Never stores photo bytes or free-text descriptions."""

    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[str]
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str]
    entity: Mapped[str]
    entity_id: Mapped[str]
    details: Mapped[Any | None] = mapped_column(JSON)
