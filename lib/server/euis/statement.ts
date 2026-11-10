import { euisGeoJson } from "../../euisExport";
import { isWoodHs, type DdsDetails } from "../../ddsShared";
import { NS } from "./client";
import { esc } from "./xml";

/**
 * dds:SubmitDdsRequest for one statement, element order as in the V4 XSD
 * (DueDiligenceStatementBaseType → DdsCommodityType → DdsProducerType) and the
 * V4 "submitDds" sample. One commodity, one producer; the producer's plots go in
 * geometryGeojson as a Base64 GeoJSON FeatureCollection (EUIS "GeoJSON File
 * Description", Type I: WGS 84, 6 decimals, closed single-ring polygons).
 */

export type StatementPlot = { plotId: string; name: string; ring: [number, number][]; areaHa: number };

/** EUIS limit on the geolocation data of one DDS. */
export const MAX_GEO_BYTES = 25 * 1024 * 1024;

export function statementGeoJson(details: DdsDetails, plots: StatementPlot[]): string {
  return euisGeoJson(
    plots.map((p) => ({
      producerName: details.producerName,
      producerCountry: details.producerCountry.toUpperCase(),
      productionPlace: p.name || p.plotId,
      areaHa: p.areaHa,
      ring: p.ring,
    })),
  );
}

const el = (prefix: string, name: string, value: string | undefined) => (value ? `<${prefix}:${name}>${esc(value)}</${prefix}:${name}>` : "");

export function submitDdsRequest(details: DdsDetails, plots: StatementPlot[], internalReference: string): string {
  const geo = Buffer.from(statementGeoJson(details, plots), "utf8").toString("base64");
  const measure =
    el("eudrCommon", "netWeight", details.netWeightKg) +
    el("eudrCommon", "supplementaryUnit", details.supplementaryUnit) +
    el("eudrCommon", "supplementaryUnitQualifier", details.supplementaryUnit ? details.supplementaryUnitQualifier : "");
  const species = isWoodHs(details.hsHeading)
    ? `<dds:speciesInfo>${el("dds", "scientificName", details.scientificName)}${el("dds", "commonName", details.commonName)}</dds:speciesInfo>`
    : "";
  return (
    `<dds:SubmitDdsRequest xmlns:dds="${NS.dds}" xmlns:eudrCommon="${NS.common}">` +
    `<dds:operatorRole>OPERATOR</dds:operatorRole>` +
    `<dds:statement>` +
    el("dds", "internalReferenceNumber", internalReference) +
    el("dds", "activityType", details.activityType) +
    el("dds", "countryOfActivity", details.countryOfActivity) +
    el("dds", "borderCrossCountry", details.activityType === "DOMESTIC" ? "" : details.borderCrossCountry) +
    el("dds", "comment", details.comment) +
    `<dds:commodities>` +
    `<dds:position>1</dds:position>` +
    `<dds:descriptors>${el("eudrCommon", "descriptionOfGoods", details.description)}<eudrCommon:goodsMeasure>${measure}</eudrCommon:goodsMeasure></dds:descriptors>` +
    el("dds", "hsHeading", details.hsHeading) +
    species +
    `<dds:producers>` +
    `<dds:position>1</dds:position>` +
    el("dds", "country", details.producerCountry.toUpperCase()) +
    el("dds", "name", details.producerName) +
    `<dds:geometryGeojson>${geo}</dds:geometryGeojson>` +
    `</dds:producers>` +
    `</dds:commodities>` +
    `<dds:geoLocationConfidential>${details.geoLocationConfidential ? "true" : "false"}</dds:geoLocationConfidential>` +
    `</dds:statement>` +
    `</dds:SubmitDdsRequest>`
  );
}
