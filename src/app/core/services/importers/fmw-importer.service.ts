import { Injectable } from '@angular/core';
import type { EtlPipelineEdge, EtlPipelineGroup, EtlPipelineJson, EtlPipelineNode } from '@app/features/copilot/copilot.types';
import { GROUP_COLOR_PALETTE } from '@app/features/editor/services/editor-canvas.utils';
import {
  applyLayoutTransform,
  applyLayoutTransformRect,
  fitRectAroundPoints,
  flipFmeRect,
  flipFmeY,
  normalizeFmeLayout,
  resolveFeatureTypeName,
  resolveFmeDisplayName,
} from './fmw-layout.utils';
import { applyHierarchicalLayoutIfOverlapping } from './fmw-hierarchy-layout.utils';
import { linkKey, mergeFmwLinks, resolveGisForgePortId } from './fmw-link.utils';
import type { FmwBookmark, FmwGuiObject, FmwImportResult, FmwLink } from './fmw-importer.types';

const TRANSFORMER_MAP: Record<string, { type: string; label: string }> = {
  tester: { type: 'tester', label: 'Tester / Filter' },
  testfilter: { type: 'tester', label: 'Tester / Filter' },
  testfactory: { type: 'tester', label: 'Tester / Filter' },
  bufferer: { type: 'buffer', label: 'Tampon spatial' },
  buffer: { type: 'buffer', label: 'Tampon spatial' },
  reprojector: { type: 'reproject', label: 'Reprojection' },
  csmapreprojector: { type: 'reproject', label: 'Reprojection' },
  attributemanager: { type: 'topology_validator', label: 'Gérer les attributs' },
  attributecopier: { type: 'topology_validator', label: 'Gérer les attributs' },
  attributekeeper: { type: 'topology_validator', label: 'Gérer les attributs' },
  attributerenamer: { type: 'topology_validator', label: 'Gérer les attributs' },
  refactorfactory: { type: 'topology_validator', label: 'Gérer les attributs' },
  featurewriter: { type: 'writer', label: 'FeatureWriter' },
  areabuilder: { type: 'clip', label: 'AreaBuilder' },
  clipper: { type: 'clip', label: 'Découpage' },
  dissolver: { type: 'topology_validator', label: 'Dissolver' },
  featuretypefilter: { type: 'tester', label: 'FeatureTypeFilter' },
  spatialfilter: { type: 'clip', label: 'SpatialFilter' },
  topologyvalidator: { type: 'topology_validator', label: 'TopologyValidator' },
};

const SKIP_FACTORY_TYPES = new Set([
  'teefactory',
  'routingfactory',
  'pythonfactory',
  'creationfactory',
  'transformfact',
]);

const READER_FORMAT_MAP: Record<string, string> = {
  SHAPEFILE: 'shapefile',
  SHAPEFILE_1: 'shapefile',
  GEOJSON: 'geojson',
  POSTGIS: 'postgis',
  POSTGIS_1: 'postgis',
  GPKG: 'geopackage',
  GEOPACKAGE: 'geopackage',
  OGCGEOPACKAGE: 'geopackage',
  CSV: 'geojson',
};

const WRITER_FORMAT_MAP: Record<string, string> = {
  SHAPEFILE: 'shapefile',
  SHAPEFILE_1: 'shapefile',
  GEOJSON: 'geojson',
  POSTGIS: 'postgis',
  POSTGIS_1: 'postgis',
  GPKG: 'geopackage',
  GEOPACKAGE: 'geopackage',
  OGCGEOPACKAGE: 'geopackage',
};

interface FmwDatasetInfo {
  format: string;
  dataset: string;
  role: 'reader' | 'writer';
  keyword: string;
}

@Injectable({ providedIn: 'root' })
export class FmwImporterService {
  parse(content: string, sourceName: string): FmwImportResult {
    const warnings: string[] = [];
    const normalized = this.normalizeContent(content);
    const workspaceXml = this.extractWorkspaceXml(normalized);
    const mappingBody = this.extractMappingBody(normalized);

    let objects: FmwGuiObject[] = [];
    let links: FmwLink[] = [];
    let bookmarks: FmwBookmark[] = [];

    if (workspaceXml) {
      const datasets = this.parseDatasets(workspaceXml);
      objects = this.parseFeatureTypes(workspaceXml, datasets, warnings);
      objects.push(...this.parseWorkbenchTransformers(workspaceXml, warnings));
      bookmarks = this.parseXmlBookmarks(workspaceXml, warnings);

      if (objects.length === 0) {
        objects = this.parseGuiObjects(workspaceXml, warnings);
      }
    }

    if (objects.length === 0) {
      objects = this.parseGuiObjects(normalized, warnings);
    }

    if (bookmarks.length === 0) {
      bookmarks = this.parseBookmarks(normalized, warnings);
    }

    this.parseMappingFileFallback(mappingBody || normalized, objects, links, warnings);

    const hasTransformers = objects.some((object) => object.objectType === 'transformer');
    if (!hasTransformers) {
      this.parseFactoryFallback(mappingBody || normalized, objects, warnings);
    }

    links = this.collectAllLinks(workspaceXml, normalized, mappingBody || normalized, warnings, objects);

    this.applyAutoLayout(objects, links.length === 0);
    this.transformFmeCoordinates(objects, bookmarks);
    this.resolveCollocatedPositions(objects);
    this.fitBookmarksToMembers(objects, bookmarks);

    const pipeline = this.buildPipeline(objects, links, bookmarks, warnings);
    return { pipeline, warnings, sourceName };
  }

  private normalizeContent(content: string): string {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const stripped = lines
      .map((line) => {
        const match = line.match(/^\s*#!\s?(.*)$/);
        return match ? match[1] : line;
      })
      .join('\n');

    return stripped
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
  }

  private extractWorkspaceXml(content: string): string | null {
    const start = content.search(/<WORKSPACE[\s>]/i);
    if (start < 0) {
      return content.includes('<FEATURE_TYPE') || content.includes('<FEAT_LINK') ? content : null;
    }

    const end = content.indexOf('</WORKSPACE>', start);
    if (end < 0) {
      return content.slice(start);
    }

    return content.slice(start, end + '</WORKSPACE>'.length);
  }

  private extractMappingBody(content: string): string {
    const endWorkspace = content.indexOf('</WORKSPACE>');
    if (endWorkspace < 0) {
      return content;
    }
    return content.slice(endWorkspace + '</WORKSPACE>'.length);
  }

  private parseDatasets(xml: string): Map<string, FmwDatasetInfo> {
    const datasets = new Map<string, FmwDatasetInfo>();
    const regex = /<DATASET\s+([\s\S]*?)\/>/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(xml)) !== null) {
      const attrs = match[1];
      const keyword = this.extractXmlAttribute(attrs, 'KEYWORD') ?? this.extractXmlAttribute(attrs, 'NAME') ?? '';
      const format = (this.extractXmlAttribute(attrs, 'FORMAT') ?? '').toUpperCase();
      const dataset = this.extractXmlAttribute(attrs, 'DATASET') ?? '';
      const roleAttr = (this.extractXmlAttribute(attrs, 'ROLE') ?? '').toUpperCase();
      const isSource = this.extractXmlAttribute(attrs, 'IS_SOURCE') === 'true';
      const role: 'reader' | 'writer' =
        roleAttr === 'READER' || isSource ? 'reader' : roleAttr === 'WRITER' || !isSource ? 'writer' : 'reader';

      if (keyword) {
        datasets.set(keyword, { format, dataset, role, keyword });
      }
    }

    return datasets;
  }

  private parseFeatureTypes(
    xml: string,
    datasets: Map<string, FmwDatasetInfo>,
    warnings: string[],
  ): FmwGuiObject[] {
    const objects: FmwGuiObject[] = [];
    const regex = /<FEATURE_TYPE\s+([\s\S]*?)>(?:[\s\S]*?<\/FEATURE_TYPE>)?/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(xml)) !== null) {
      const attrs = match[1];
      const identifier = this.extractXmlAttribute(attrs, 'IDENTIFIER');
      if (!identifier) {
        continue;
      }

      const isSource = this.extractXmlAttribute(attrs, 'IS_SOURCE') === 'true';
      const nodeName = resolveFeatureTypeName(attrs);
      const keyword = this.extractXmlAttribute(attrs, 'KEYWORD') ?? '';
      const datasetInfo = keyword ? datasets.get(keyword) : undefined;
      const positionRaw = this.extractXmlAttribute(attrs, 'POSITION');
      const position = this.parsePosition(positionRaw, objects.length);

      const objectType: FmwGuiObject['objectType'] = isSource ? 'reader' : 'writer';
      const config = this.buildIoConfig(objectType, datasetInfo, attrs, keyword);

      objects.push({
        identifier,
        name: nodeName,
        objectType,
        position,
        hasExplicitPosition: Boolean(positionRaw),
        config,
      });
    }

    if (objects.length === 0) {
      warnings.push('Aucun FEATURE_TYPE détecté dans le workspace XML.');
    }

    return objects;
  }

  private parseWorkbenchTransformers(xml: string, warnings: string[]): FmwGuiObject[] {
    const objects: FmwGuiObject[] = [];
    const regex = /<TRANSFORMER\s+([\s\S]*?)>(?:[\s\S]*?<\/TRANSFORMER>)?/gi;
    let match: RegExpExecArray | null;
    let index = 0;

    while ((match = regex.exec(xml)) !== null) {
      const block = match[0];
      const attrs = match[1];
      const identifier = this.extractXmlAttribute(attrs, 'IDENTIFIER') ?? `xfm-${index++}`;
      const displayName = resolveFmeDisplayName(attrs, block, identifier);
      const transformerTypeName =
        this.extractXmlAttribute(attrs, 'TRANSFORMER_NAME') ??
        this.extractXmlAttribute(attrs, 'PLUGIN_NAME') ??
        displayName;
      const positionRaw = this.extractXmlAttribute(attrs, 'POSITION');
      const position = this.parsePosition(positionRaw, objects.length);
      const mapped = this.mapTransformerName(transformerTypeName);

      if (mapped.objectType === 'writer') {
        objects.push({
          identifier,
          name: displayName,
          objectType: 'writer',
          position,
          hasExplicitPosition: Boolean(positionRaw),
          config: this.extractConfigFromSnippet(block, { objectType: 'writer' }),
        });
        continue;
      }

      objects.push({
        identifier,
        name: displayName,
        objectType: 'transformer',
        transformerKind: mapped.type,
        position,
        hasExplicitPosition: Boolean(positionRaw),
        config: this.extractConfigFromSnippet(block, {
          objectType: 'transformer',
          transformerKind: mapped.type,
        }),
      });
    }

    return objects;
  }

  private collectAllLinks(
    workspaceXml: string | null,
    normalized: string,
    mappingBody: string,
    warnings: string[],
    objects: FmwGuiObject[],
  ): FmwLink[] {
    const collected: FmwLink[] = [];
    const transformerIds = new Set(
      objects.filter((object) => object.objectType === 'transformer').map((object) => object.identifier),
    );

    if (workspaceXml) {
      const featLinks = this.parseFeatLinks(workspaceXml);
      collected.push(...featLinks);

      const attrLinks = this.parseAttrLinks(workspaceXml);
      if (featLinks.length === 0) {
        collected.push(...attrLinks);
      } else if (transformerIds.size > 0) {
        collected.push(
          ...attrLinks.filter(
            (link) => transformerIds.has(link.sourceId) || transformerIds.has(link.targetId),
          ),
        );
      }
    }

    collected.push(...this.parseLinks(normalized, warnings, false));

    const mergedPrimary = mergeFmwLinks(collected);
    if (mergedPrimary.length > 0) {
      return mergedPrimary;
    }

    const fallbacks: FmwLink[] = [
      ...this.parseRoutingConnections(mappingBody, warnings),
      ...this.parseFactoryDefLinks(mappingBody),
      ...this.parseFeatTypeConnections(normalized),
      ...this.parseFeatTypeConnections(mappingBody),
    ];

    const merged = mergeFmwLinks(fallbacks);
    if (merged.length === 0) {
      warnings.push('Aucune connexion FME détectée — chaînage séquentiel possible.');
    }
    return merged;
  }

  private parseFeatLinks(xml: string): FmwLink[] {
    const links: FmwLink[] = [];
    const regex = /<FEAT_LINK\s+([\s\S]*?)(?:\/>|>)/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(xml)) !== null) {
      const attrs = match[1];
      const sourceId =
        this.extractXmlAttribute(attrs, 'SOURCE_NODE') ?? this.extractXmlAttribute(attrs, 'SOURCE');
      const targetId =
        this.extractXmlAttribute(attrs, 'TARGET_NODE') ??
        this.extractXmlAttribute(attrs, 'TARGET') ??
        this.extractXmlAttribute(attrs, 'DEST_NODE');
      if (!sourceId || !targetId) {
        continue;
      }

      links.push({
        sourceId,
        targetId,
        sourcePort:
          this.extractXmlAttribute(attrs, 'SOURCE_PORT_DESC') ??
          this.extractXmlAttribute(attrs, 'SOURCE_PORT') ??
          undefined,
        targetPort:
          this.extractXmlAttribute(attrs, 'TARGET_PORT_DESC') ??
          this.extractXmlAttribute(attrs, 'TARGET_PORT') ??
          undefined,
      });
    }

    return links;
  }

  private parseAttrLinks(xml: string): FmwLink[] {
    const links: FmwLink[] = [];
    const regex = /<ATTR_LINK\s+([\s\S]*?)(?:\/>|>)/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(xml)) !== null) {
      const attrs = match[1];
      const sourceId = this.extractXmlAttribute(attrs, 'SOURCE_NODE');
      const targetId = this.extractXmlAttribute(attrs, 'TARGET_NODE');
      if (!sourceId || !targetId) {
        continue;
      }
      links.push({
        sourceId,
        targetId,
        sourcePort: this.extractXmlAttribute(attrs, 'SOURCE_PORT_DESC') ?? undefined,
        targetPort: this.extractXmlAttribute(attrs, 'TARGET_PORT_DESC') ?? undefined,
      });
    }

    return links;
  }

  private parseFeatTypeConnections(content: string): FmwLink[] {
    const links: FmwLink[] = [];
    const patterns = [
      /FEAT_TYPE_CONN(?:ECTION)?\s+(\S+)\s+(\S+)/gi,
      /FEAT_TYPE_CONN(?:ECTION)?\s+"([^"]+)"\s+"([^"]+)"/gi,
      /FEATURE_TYPE_CONNECTION\s+(\S+)\s+(\S+)/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        links.push({ sourceId: match[1], targetId: match[2] });
      }
    }

    return links;
  }

  private parseFactoryDefLinks(content: string): FmwLink[] {
    const links: FmwLink[] = [];
    const inputOutputRegex = /INPUT\s+FEATURE_TYPE\s+(\S+)\s+OUTPUT\s+FEATURE_TYPE\s+(\S+)/gi;
    let match: RegExpExecArray | null;

    while ((match = inputOutputRegex.exec(content)) !== null) {
      links.push({ sourceId: match[1], targetId: match[2] });
    }

    return links;
  }

  private parseXmlBookmarks(xml: string, warnings: string[]): FmwBookmark[] {
    const bookmarks: FmwBookmark[] = [];
    const regex = /<BOOKMARK\s+([\s\S]*?)>(?:[\s\S]*?<\/BOOKMARK>)?/gi;
    let match: RegExpExecArray | null;
    let colorIndex = 0;

    while ((match = regex.exec(xml)) !== null) {
      const attrs = match[1];
      const name =
        this.extractXmlAttribute(attrs, 'NAME') ??
        this.extractXmlAttribute(attrs, 'BOOKMARK_NAME') ??
        `Groupe ${colorIndex + 1}`;
      const topLeft = this.extractXmlAttribute(attrs, 'TOP_LEFT');
      const bottomRight = this.extractXmlAttribute(attrs, 'BOTTOM_RIGHT');
      const boundingRect = this.extractXmlAttribute(attrs, 'BOUNDING_RECT');
      const contents = this.extractXmlAttribute(attrs, 'CONTENTS');
      const colour = this.extractXmlAttribute(attrs, 'COLOUR') ?? this.extractXmlAttribute(attrs, 'COLOR');

      const rect = this.parseBookmarkRect(topLeft, bottomRight, boundingRect, colorIndex);
      bookmarks.push({
        name,
        position: rect.position,
        size: rect.size,
        color: this.parseRgbaColour(colour) ?? GROUP_COLOR_PALETTE[colorIndex % GROUP_COLOR_PALETTE.length],
        memberIds: contents ? contents.trim().split(/\s+/).filter(Boolean) : undefined,
      });
      colorIndex++;
    }

    return bookmarks;
  }

  private parseMappingFileFallback(
    content: string,
    objects: FmwGuiObject[],
    links: FmwLink[],
    warnings: string[],
  ): void {
    const existingIds = new Set(objects.map((object) => object.identifier));
    let readerIndex = 0;
    let writerIndex = 0;
    let transformerIndex = 0;

    const readerPatterns = [
      /INCLUDE_READER_TYPE\s+(\S+)/gi,
      /READER_TYPE\s+(\S+)/gi,
      /(\w+)_READER_TYPE\s+(\S+)/gi,
    ];

    for (const pattern of readerPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const readerType = match[match.length - 1];
        const identifier = `reader-${readerIndex++}`;
        if (existingIds.has(identifier)) {
          continue;
        }
        const dataset =
          this.findDatasetForKeyword(content, readerType) ??
          this.readQuoted(content, new RegExp(`${readerType}_DATASET\\s+"([^"]+)"`, 'i')) ??
          this.readValue(content, new RegExp(`${readerType}_DATASET\\s+(\\S+)`, 'i'));

        objects.push({
          identifier,
          name: readerType,
          objectType: 'reader',
          position: this.gridPosition(objects.length),
          config: this.buildIoConfig('reader', {
            format: readerType,
            dataset: dataset ?? '',
            role: 'reader',
            keyword: readerType,
          }),
        });
        existingIds.add(identifier);
      }
    }

    const writerPatterns = [
      /INCLUDE_WRITER_TYPE\s+(\S+)/gi,
      /WRITER_TYPE\s+(\S+)/gi,
      /(\w+)_WRITER_TYPE\s+(\S+)/gi,
    ];

    for (const pattern of writerPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const writerType = match[match.length - 1];
        const identifier = `writer-${writerIndex++}`;
        if (existingIds.has(identifier)) {
          continue;
        }
        const dataset =
          this.findDatasetForKeyword(content, writerType) ??
          this.readQuoted(content, new RegExp(`${writerType}_DATASET\\s+"([^"]+)"`, 'i')) ??
          this.readValue(content, new RegExp(`${writerType}_DATASET\\s+(\\S+)`, 'i'));

        objects.push({
          identifier,
          name: writerType,
          objectType: 'writer',
          position: this.gridPosition(objects.length),
          config: this.buildIoConfig('writer', {
            format: writerType,
            dataset: dataset ?? '',
            role: 'writer',
            keyword: writerType,
          }),
        });
        existingIds.add(identifier);
      }
    }

    const macroDatasetRegex = /MACRO\s+(\w+_DATASET)\s+([^\n#]+)/gi;
    let macroMatch: RegExpExecArray | null;
    while ((macroMatch = macroDatasetRegex.exec(content)) !== null) {
      const macroName = macroMatch[1];
      const datasetValue = macroMatch[2].trim();
      const isWriter = macroName.toUpperCase().includes('DEST') || macroName.toUpperCase().includes('WRITER');
      const identifier = `macro-${macroName}`;
      if (existingIds.has(identifier)) {
        continue;
      }

      objects.push({
        identifier,
        name: macroName,
        objectType: isWriter ? 'writer' : 'reader',
        position: this.gridPosition(objects.length),
        config: this.buildIoConfig(isWriter ? 'writer' : 'reader', {
          format: '',
          dataset: datasetValue,
          role: isWriter ? 'writer' : 'reader',
          keyword: macroName,
        }),
      });
      existingIds.add(identifier);
    }

    const transformerNameRegex = /TRANSFORMER_NAME\s+"([^"]+)"/gi;
    let transformerMatch: RegExpExecArray | null;
    while ((transformerMatch = transformerNameRegex.exec(content)) !== null) {
      const transformerName = transformerMatch[1];
      const mapped = this.mapTransformerName(transformerName);
      const block = content.slice(transformerMatch.index, transformerMatch.index + 800);
      const displayName = resolveFmeDisplayName('', block, `xfm-${transformerIndex}`);
      const identifier = `xfm-name-${transformerIndex++}`;
      if (existingIds.has(identifier)) {
        continue;
      }

      objects.push({
        identifier,
        name: displayName,
        objectType: mapped.objectType === 'writer' ? 'writer' : 'transformer',
        transformerKind: mapped.type,
        position: this.gridPosition(objects.length),
        config: this.extractConfigFromSnippet(content.slice(transformerMatch.index, transformerMatch.index + 800), {
          objectType: mapped.objectType === 'writer' ? 'writer' : 'transformer',
          transformerKind: mapped.type,
        }),
      });
      existingIds.add(identifier);
    }

    const factoryRegex = /FACTORY_DEF\s+\S+\s+(\w+)([\s\S]*?)(?=\nFACTORY_DEF|\n# -{3,}|\n*$)/gi;
    let factoryMatch: RegExpExecArray | null;
    while ((factoryMatch = factoryRegex.exec(content)) !== null) {
      const factoryType = factoryMatch[1];
      const block = factoryMatch[0];
      const normalizedFactory = factoryType.toLowerCase();
      if (SKIP_FACTORY_TYPES.has(normalizedFactory)) {
        continue;
      }

      const mapped = this.mapTransformerName(factoryType);
      if (!mapped.type) {
        continue;
      }

      const factoryName = resolveFmeDisplayName('', block, `factory-${transformerIndex}`);
      const identifier = `factory-${transformerIndex++}`;
      if (existingIds.has(identifier)) {
        continue;
      }

      if (mapped.objectType === 'writer') {
        objects.push({
          identifier,
          name: factoryName,
          objectType: 'writer',
          position: this.gridPosition(objects.length),
          config: this.extractConfigFromSnippet(block, { objectType: 'writer' }),
        });
      } else {
        objects.push({
          identifier,
          name: factoryName,
          objectType: 'transformer',
          transformerKind: mapped.type,
          position: this.gridPosition(objects.length),
          config: this.extractConfigFromSnippet(block, {
            objectType: 'transformer',
            transformerKind: mapped.type,
          }),
        });
      }
      existingIds.add(identifier);
    }

    if (objects.length === 0) {
      warnings.push('MAPPING_FILE : aucun reader/writer/transformer extrait.');
    }
  }

  private parseRoutingConnections(content: string, warnings: string[]): FmwLink[] {
    const links: FmwLink[] = [];

    const connectParmPatterns = [
      /CONNECT_PARM\s+(\S+)\s+(\S+)(?:\s+(\S+)\s+(\S+))?/gi,
      /CONNECT_PARM\s+SOURCE_NODE\s+(\S+)\s+(?:TARGET|DEST)_NODE\s+(\S+)(?:\s+SOURCE_PORT\s+(\S+))?(?:\s+TARGET_PORT\s+(\S+))?/gi,
      /(\w+)_OUTPUT_PORT\s+(\S+)[\s\S]{0,120}?(\w+)_INPUT_PORT\s+(\S+)/gi,
    ];

    for (const pattern of connectParmPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        links.push({
          sourceId: match[1],
          targetId: match[2],
          sourcePort: match[3] ?? undefined,
          targetPort: match[4] ?? undefined,
        });
      }
    }

    const routingNodeRegex = /ROUTING_NODE\s+(\S+)\s+(.+)/gi;
    const routingNodes = new Map<string, string>();
    let routingMatch: RegExpExecArray | null;
    while ((routingMatch = routingNodeRegex.exec(content)) !== null) {
      routingNodes.set(routingMatch[1], routingMatch[2].trim());
    }

    if (links.length === 0 && routingNodes.size > 0) {
      warnings.push('ROUTING_NODE détectés mais aucune connexion CONNECT_PARM explicite.');
    }

    return links;
  }

  private parseGuiObjects(content: string, warnings: string[]): FmwGuiObject[] {
    const objects: FmwGuiObject[] = [];
    const blocks = content.split(/(?=#\s*-{3,})/g);

    for (const block of blocks) {
      const identifier = this.readValue(block, /IDENTIFIER\s+(\S+)/i);
      if (!identifier) {
        continue;
      }

      const positionMatch = block.match(/POSITION\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
      const position = positionMatch
        ? { x: Number(positionMatch[1]), y: Number(positionMatch[2]) }
        : this.gridPosition(objects.length);

      const name = resolveFmeDisplayName('', block, identifier);

      const kind = this.classifyObjectName(name, block);
      objects.push({
        identifier,
        name,
        objectType: kind.objectType,
        transformerKind: kind.transformerKind,
        position,
        hasExplicitPosition: Boolean(positionMatch),
        config: this.extractConfigFromSnippet(block, kind),
      });
    }

    if (objects.length === 0) {
      const identifierRegex = /IDENTIFIER\s+(\d+)/gi;
      let match: RegExpExecArray | null;
      while ((match = identifierRegex.exec(content)) !== null) {
        const identifier = match[1];
        if (objects.some((item) => item.identifier === identifier)) {
          continue;
        }
        const slice = content.slice(match.index, match.index + 1200);
        const positionMatch = slice.match(/POSITION\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
        const name = resolveFmeDisplayName('', slice, identifier);
        const kind = this.classifyObjectName(name, slice);
        objects.push({
          identifier,
          name,
          objectType: kind.objectType,
          transformerKind: kind.transformerKind,
          position: positionMatch
            ? { x: Number(positionMatch[1]), y: Number(positionMatch[2]) }
            : this.gridPosition(objects.length),
          hasExplicitPosition: Boolean(positionMatch),
          config: this.extractConfigFromSnippet(slice, kind),
        });
      }
    }

    if (objects.length === 0) {
      warnings.push('Structure GUI FME non reconnue dans le fichier .fmw.');
    }

    return objects;
  }

  private parseFactoryFallback(content: string, objects: FmwGuiObject[], warnings: string[]): void {
    const factoryRegex = /FACTORY_DEF\s+\S+\s+(\w+)/gi;
    let index = objects.length;
    let match: RegExpExecArray | null;

    while ((match = factoryRegex.exec(content)) !== null) {
      const factoryName = match[1];
      const normalized = factoryName.toLowerCase();
      if (SKIP_FACTORY_TYPES.has(normalized)) {
        continue;
      }

      const mapped = TRANSFORMER_MAP[normalized];
      if (!mapped) {
        continue;
      }

      const identifier = `factory-${index++}`;
      if (objects.some((object) => object.identifier === identifier)) {
        continue;
      }

      const block = content.slice(match.index, match.index + 800);
      const displayName = resolveFmeDisplayName('', block, identifier);
      objects.push({
        identifier,
        name: displayName,
        objectType: mapped.type === 'writer' ? 'writer' : 'transformer',
        transformerKind: mapped.type === 'writer' ? undefined : mapped.type,
        position: this.gridPosition(objects.length),
        config: this.extractConfigFromSnippet(block, {
          objectType: mapped.type === 'writer' ? 'writer' : 'transformer',
          transformerKind: mapped.type === 'writer' ? undefined : mapped.type,
        }),
      });
    }

    if (!objects.some((object) => object.objectType === 'transformer')) {
      warnings.push('FACTORY_DEF présents mais aucun transformeur mappable (hors Tee/Routing).');
    }
  }

  private parseLinks(content: string, warnings: string[], warnIfEmpty = true): FmwLink[] {
    const links: FmwLink[] = [];
    const patterns = [
      /SOURCE_NODE\s*=\s*"(\d+)"[\s\S]*?TARGET_NODE\s*=\s*"(\d+)"/gi,
      /SOURCE_NODE\s+(\d+)\s+(?:TARGET|DEST)_NODE\s+(\d+)/gi,
      /SOURCE\s+(\d+)\s+DEST(?:INATION)?\s+(\d+)/gi,
      /LINK\s+(\d+)\s+(\d+)/gi,
      /<(?:LINK|Link)[^>]*?(?:source|SOURCE)\s*=\s*"?(\d+)"?[^>]*?(?:dest|DEST|target|TARGET)\s*=\s*"?(\d+)"?[^>]*?>/gi,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        links.push({
          sourceId: match[1],
          targetId: match[2],
          sourcePort: match[3] ?? undefined,
          targetPort: match[4] ?? undefined,
        });
      }
    }

    if (warnIfEmpty && links.length === 0) {
      warnings.push('Aucune connexion texte détectée dans le mapping file.');
    }

    return links;
  }

  private parseBookmarks(content: string, warnings: string[]): FmwBookmark[] {
    const bookmarks: FmwBookmark[] = [];
    let colorIndex = 0;

    const xmlBookmarkRegex = /<BOOKMARK\s+([\s\S]*?)>(?:[\s\S]*?<\/BOOKMARK>)?/gi;
    let match: RegExpExecArray | null;
    while ((match = xmlBookmarkRegex.exec(content)) !== null) {
      const attrs = match[1];
      const name = this.extractXmlAttribute(attrs, 'NAME') ?? `Groupe ${colorIndex + 1}`;
      const topLeft = this.extractXmlAttribute(attrs, 'TOP_LEFT');
      const bottomRight = this.extractXmlAttribute(attrs, 'BOTTOM_RIGHT');
      const boundingRect = this.extractXmlAttribute(attrs, 'BOUNDING_RECT');
      const contents = this.extractXmlAttribute(attrs, 'CONTENTS');
      const colour = this.extractXmlAttribute(attrs, 'COLOUR') ?? this.extractXmlAttribute(attrs, 'COLOR');
      const rect = this.parseBookmarkRect(topLeft, bottomRight, boundingRect, colorIndex);

      bookmarks.push({
        name,
        position: rect.position,
        size: rect.size,
        color: this.parseRgbaColour(colour) ?? GROUP_COLOR_PALETTE[colorIndex % GROUP_COLOR_PALETTE.length],
        memberIds: contents ? contents.trim().split(/\s+/).filter(Boolean) : undefined,
      });
      colorIndex++;
    }

    const legacyPatterns = [
      /WORKSPACE_BOOKMARK\s+"([^"]+)"[\s\S]*?POSITION\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/gi,
      /GUI\s+BOOKMARK\s+"([^"]+)"[\s\S]*?POSITION\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/gi,
      /BOOKMARK(?:_DEF)?\s+"?([^"\n]+)"?[\s\S]*?POSITION\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/gi,
      /BOOKMARK_RECT\s+"?([^"\n]+)"?\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/gi,
    ];

    for (const pattern of legacyPatterns) {
      while ((match = pattern.exec(content)) !== null) {
        bookmarks.push({
          name: match[1].trim(),
          position: { x: Number(match[2]), y: Number(match[3]) },
          size: { width: Number(match[4]), height: Number(match[5]) },
          color: GROUP_COLOR_PALETTE[colorIndex++ % GROUP_COLOR_PALETTE.length],
        });
      }
    }

    return bookmarks;
  }

  private transformFmeCoordinates(objects: FmwGuiObject[], bookmarks: FmwBookmark[]): void {
    const hasExplicitLayout = objects.some((object) => object.hasExplicitPosition);
    if (!hasExplicitLayout) {
      return;
    }

    for (const object of objects) {
      if (object.hasExplicitPosition) {
        object.position = flipFmeY(object.position);
      }
    }

    for (const bookmark of bookmarks) {
      const flipped = flipFmeRect({
        position: bookmark.position,
        size: bookmark.size,
      });
      bookmark.position = flipped.position;
      bookmark.size = flipped.size;
    }

    const { scale, offset } = normalizeFmeLayout(
      objects.map((object) => object.position),
      bookmarks.map((bookmark) => ({ position: bookmark.position, size: bookmark.size })),
    );

    for (const object of objects) {
      object.position = applyLayoutTransform(object.position, scale, offset);
    }

    for (const bookmark of bookmarks) {
      const transformed = applyLayoutTransformRect(
        { position: bookmark.position, size: bookmark.size },
        scale,
        offset,
      );
      bookmark.position = transformed.position;
      bookmark.size = transformed.size;
    }
  }

  private fitBookmarksToMembers(objects: FmwGuiObject[], bookmarks: FmwBookmark[]): void {
    const positionById = new Map(objects.map((object) => [object.identifier, object.position]));

    for (const bookmark of bookmarks) {
      if (!bookmark.memberIds?.length) {
        continue;
      }

      const memberPositions = bookmark.memberIds
        .map((id) => positionById.get(id))
        .filter((position): position is { x: number; y: number } => Boolean(position));

      const fitted = fitRectAroundPoints(memberPositions);
      if (!fitted) {
        continue;
      }

      bookmark.position = fitted.position;
      bookmark.size = fitted.size;
    }
  }

  private resolveCollocatedPositions(objects: FmwGuiObject[]): void {
    const buckets = new Map<string, FmwGuiObject[]>();

    for (const object of objects) {
      const key = `${Math.round(object.position.x)}:${Math.round(object.position.y)}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(object);
      buckets.set(key, bucket);
    }

    for (const bucket of buckets.values()) {
      if (bucket.length < 2) {
        continue;
      }
      bucket.forEach((object, index) => {
        object.position = {
          x: object.position.x + index * 40,
          y: object.position.y + index * 160,
        };
      });
    }
  }

  private applyAutoLayout(objects: FmwGuiObject[], forceGrid: boolean): void {
    const cols = Math.max(1, Math.ceil(Math.sqrt(objects.length)));
    objects.forEach((object, index) => {
      const missingPosition =
        !object.hasExplicitPosition || (object.position.x === 0 && object.position.y === 0);
      if (!missingPosition) {
        return;
      }
      if (!forceGrid && object.hasExplicitPosition) {
        return;
      }
      const col = index % cols;
      const row = Math.floor(index / cols);
      object.position = { x: 80 + col * 240, y: 80 + row * 140 };
    });
  }

  private buildPipeline(
    objects: FmwGuiObject[],
    links: FmwLink[],
    bookmarks: FmwBookmark[],
    warnings: string[],
  ): EtlPipelineJson {
    const nodes: EtlPipelineNode[] = objects.map((object) => ({
      id: `fmw-${object.identifier}`,
      type: this.resolveNodeType(object),
      label: object.name,
      config: object.config,
      position: object.position,
    }));

    const nodeAliasToIdMap = this.buildNodeAliasMap(objects, nodes);
    const edges: EtlPipelineEdge[] = [];
    const dedupedLinks = new Map<string, FmwLink>();

    for (const link of links) {
      const sourceNodeId = this.resolveLinkToNodeId(link.sourceId, nodeAliasToIdMap, nodes, warnings);
      const targetNodeId = this.resolveLinkToNodeId(link.targetId, nodeAliasToIdMap, nodes, warnings);
      if (!sourceNodeId || !targetNodeId) {
        warnings.push(
          `Liaison non résolue (nœud introuvable) : ${link.sourceId} → ${link.targetId}`,
        );
        continue;
      }

      const normalizedLink: FmwLink = {
        ...link,
        sourceId: sourceNodeId.replace(/^fmw-/, ''),
        targetId: targetNodeId.replace(/^fmw-/, ''),
      };
      dedupedLinks.set(linkKey(normalizedLink), normalizedLink);
    }

    const nodeTypeById = new Map(nodes.map((node) => [node.id, node.type]));
    let edgeIndex = 0;

    for (const link of dedupedLinks.values()) {
      const source = link.sourceId.startsWith('fmw-') ? link.sourceId : `fmw-${link.sourceId}`;
      const target = link.targetId.startsWith('fmw-') ? link.targetId : `fmw-${link.targetId}`;
      if (!nodes.some((node) => node.id === source) || !nodes.some((node) => node.id === target)) {
        continue;
      }

      const sourceType = nodeTypeById.get(source) ?? 'transformer';
      const targetType = nodeTypeById.get(target) ?? 'transformer';
      const sourcePort = resolveGisForgePortId(link.sourcePort, sourceType, 'source');
      const targetPort = resolveGisForgePortId(link.targetPort, targetType, 'target');

      edges.push({
        id: `edge-${edgeIndex++}-${source}-${target}`,
        source,
        target,
        sourcePort,
        targetPort,
      });
    }

    if (edges.length === 0 && nodes.length > 1) {
      for (let index = 0; index < nodes.length - 1; index++) {
        edges.push({
          id: `edge-seq-${index}`,
          source: nodes[index].id,
          target: nodes[index + 1].id,
        });
      }
    }

    if (applyHierarchicalLayoutIfOverlapping(nodes, edges)) {
      warnings.push('Chevauchement détecté — disposition hiérarchique gauche→droite appliquée.');
    }

    const groups: EtlPipelineGroup[] = bookmarks.map((bookmark, index) => ({
      id: `bookmark-${index}-${crypto.randomUUID().slice(0, 6)}`,
      label: bookmark.name,
      color: bookmark.color ?? GROUP_COLOR_PALETTE[index % GROUP_COLOR_PALETTE.length],
      position: bookmark.position,
      size: bookmark.size,
    }));

    const bookmarkIdByMember = new Map<string, string>();
    bookmarks.forEach((bookmark, index) => {
      const groupId = groups[index]?.id;
      if (!groupId || !bookmark.memberIds) {
        return;
      }
      for (const memberId of bookmark.memberIds) {
        bookmarkIdByMember.set(memberId, groupId);
      }
    });

    for (const node of nodes) {
      const rawId = node.id.replace(/^fmw-/, '');
      const groupId = bookmarkIdByMember.get(rawId);
      if (groupId) {
        node.groupId = groupId;
      }
    }

    if (nodes.length === 0) {
      warnings.push('Le workspace FME ne contient aucun nœud convertible.');
    }

    return {
      version: 1,
      nodes,
      edges,
      groups,
    };
  }

  private buildNodeAliasMap(
    objects: FmwGuiObject[],
    nodes: EtlPipelineNode[],
  ): Map<string, string> {
    const aliasToNodeId = new Map<string, string>();

    const registerAlias = (alias: string | undefined | null, nodeId: string): void => {
      if (!alias?.trim()) {
        return;
      }
      const trimmed = alias.trim();
      aliasToNodeId.set(trimmed, nodeId);
      aliasToNodeId.set(trimmed.toLowerCase(), nodeId);
      aliasToNodeId.set(`fmw-${trimmed}`, nodeId);
      aliasToNodeId.set(`NODE_FACTORY-${trimmed}`, nodeId);
      aliasToNodeId.set(`node_${trimmed}`, nodeId);
      aliasToNodeId.set(`node_${trimmed}`.toLowerCase(), nodeId);
    };

    for (const object of objects) {
      const nodeId = `fmw-${object.identifier}`;
      const shortName = object.name.includes('.') ? object.name.split('.').pop()! : object.name;
      const factoryAlias = object.identifier.replace(/^factory-/i, '');

      registerAlias(object.identifier, nodeId);
      registerAlias(object.name, nodeId);
      registerAlias(shortName, nodeId);
      registerAlias(`factory-${factoryAlias}`, nodeId);
      registerAlias(`NODE_FACTORY-${factoryAlias}`, nodeId);
      registerAlias(`node_factory-${factoryAlias}`, nodeId);

      const configAliases = [
        object.config['factoryName'],
        object.config['nodeName'],
        object.config['featureType'],
        object.config['keyword'],
      ];
      for (const value of configAliases) {
        if (typeof value === 'string') {
          registerAlias(value, nodeId);
        }
      }
    }

    for (const node of nodes) {
      registerAlias(node.id, node.id);
      registerAlias(node.id.replace(/^fmw-/, ''), node.id);
      registerAlias(node.label, node.id);
      const shortLabel = node.label.includes('.') ? node.label.split('.').pop()! : node.label;
      registerAlias(shortLabel, node.id);
    }

    return aliasToNodeId;
  }

  private resolveLinkToNodeId(
    rawId: string,
    nodeAliasToIdMap: Map<string, string>,
    nodes: EtlPipelineNode[],
    warnings: string[],
  ): string | null {
    const cleaned = rawId.replace(/^::/, '').trim();
    if (!cleaned) {
      return null;
    }

    const direct =
      nodeAliasToIdMap.get(cleaned)
      ?? nodeAliasToIdMap.get(cleaned.toLowerCase())
      ?? nodeAliasToIdMap.get(`fmw-${cleaned}`)
      ?? nodeAliasToIdMap.get(`NODE_FACTORY-${cleaned}`)
      ?? nodeAliasToIdMap.get(`factory-${cleaned}`);
    if (direct) {
      return direct;
    }

    const shortName = cleaned.includes('.') ? cleaned.split('.').pop()! : cleaned;
    const byShort =
      nodeAliasToIdMap.get(shortName)
      ?? nodeAliasToIdMap.get(shortName.toLowerCase());
    if (byShort) {
      return byShort;
    }

    const lowered = cleaned.toLowerCase();
    for (const [alias, nodeId] of nodeAliasToIdMap.entries()) {
      if (alias.toLowerCase() === lowered) {
        return nodeId;
      }
    }

    const labelMatch = this.findNodeByLabel(nodes, cleaned);
    if (labelMatch) {
      warnings.push(`Liaison résolue par libellé : ${cleaned} → ${labelMatch.label}`);
      return labelMatch.id;
    }

    const suffix = cleaned
      .replace(/^NODE_FACTORY-/i, '')
      .replace(/^factory-/i, '')
      .replace(/^node_/i, '');
    for (const node of nodes) {
      const rawNodeId = node.id.replace(/^fmw-/, '');
      if (
        rawNodeId === suffix
        || rawNodeId.endsWith(`-${suffix}`)
        || node.id.endsWith(`-${suffix}`)
      ) {
        warnings.push(`Liaison résolue par suffixe d'identifiant : ${cleaned} → ${node.id}`);
        return node.id;
      }
    }

    return null;
  }

  private findNodeByLabel(nodes: EtlPipelineNode[], rawId: string): EtlPipelineNode | null {
    const lowered = rawId.toLowerCase();
    const exact = nodes.find((node) => node.label.toLowerCase() === lowered);
    if (exact) {
      return exact;
    }

    const partial = nodes.find(
      (node) =>
        node.label.toLowerCase().includes(lowered)
        || lowered.includes(node.label.toLowerCase()),
    );
    return partial ?? null;
  }

  private mapTransformerName(name: string): {
    type: string;
    label?: string;
    objectType: 'transformer' | 'writer';
  } {
    const normalized = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const direct = TRANSFORMER_MAP[normalized];
    if (direct) {
      return {
        type: direct.type,
        label: direct.label,
        objectType: direct.type === 'writer' ? 'writer' : 'transformer',
      };
    }

    for (const [key, value] of Object.entries(TRANSFORMER_MAP)) {
      if (normalized.includes(key)) {
        return {
          type: value.type,
          label: value.label,
          objectType: value.type === 'writer' ? 'writer' : 'transformer',
        };
      }
    }

    return { type: 'topology_validator', label: name, objectType: 'transformer' };
  }

  private classifyObjectName(
    name: string,
    snippet: string,
  ): { objectType: FmwGuiObject['objectType']; transformerKind?: string } {
    const upper = name.toUpperCase();
    const mapped = this.mapTransformerName(name);

    if (upper.includes('READER') || /READER_TYPE\s+/i.test(snippet) || /INCLUDE_READER_TYPE/i.test(snippet)) {
      return { objectType: 'reader' };
    }
    if (
      upper.includes('WRITER') ||
      upper.includes('FEATUREWRITER') ||
      /WRITER_TYPE\s+/i.test(snippet) ||
      /INCLUDE_WRITER_TYPE/i.test(snippet)
    ) {
      return { objectType: 'writer' };
    }

    if (mapped.objectType === 'writer') {
      return { objectType: 'writer' };
    }

    return { objectType: 'transformer', transformerKind: mapped.type };
  }

  private resolveNodeType(object: FmwGuiObject): string {
    if (object.objectType === 'reader') {
      return 'reader';
    }
    if (object.objectType === 'writer') {
      return 'writer';
    }
    return object.transformerKind ?? 'topology_validator';
  }

  private buildIoConfig(
    objectType: 'reader' | 'writer',
    datasetInfo?: FmwDatasetInfo | { format: string; dataset: string; role: 'reader' | 'writer'; keyword: string },
    snippet = '',
    keyword = '',
  ): Record<string, unknown> {
    const formatKey = (datasetInfo?.format ?? keyword).toUpperCase();
    const formatMap = objectType === 'reader' ? READER_FORMAT_MAP : WRITER_FORMAT_MAP;
    const config: Record<string, unknown> = {
      format: formatMap[formatKey] ?? 'geojson',
    };

    const dataset = datasetInfo?.dataset;
    if (dataset) {
      config['dataset'] = dataset;
      config['tableName'] = this.basename(dataset.replace(/^\$\(/, '').replace(/\)$/, ''));
    }

    if (objectType === 'writer') {
      config['featureOperation'] = 'insert';
      config['tableHandling'] = 'create_if_needed';
    }

    this.applyPostgisConfig(snippet, config);
    return config;
  }

  private extractConfigFromSnippet(
    snippet: string,
    kind: { objectType: FmwGuiObject['objectType']; transformerKind?: string },
  ): Record<string, unknown> {
    const config: Record<string, unknown> = {};

    const readerType = this.readValue(snippet, /READER_TYPE\s+(\S+)/i);
    const writerType = this.readValue(snippet, /WRITER_TYPE\s+(\S+)/i);
    const dataset =
      this.readQuoted(snippet, /(?:READER|WRITER|SOURCE|DEST|DATASET)[^\n]*"([^"]+)"/i) ??
      this.readValue(snippet, /DATASET\s+(\S+)/i);

    if (kind.objectType === 'reader') {
      const format = READER_FORMAT_MAP[(readerType ?? '').toUpperCase()] ?? 'geojson';
      config['format'] = format;
      if (dataset) {
        config['dataset'] = dataset;
        config['tableName'] = this.basename(dataset);
      }
      this.applyPostgisConfig(snippet, config);
      return config;
    }

    if (kind.objectType === 'writer') {
      const format = WRITER_FORMAT_MAP[(writerType ?? '').toUpperCase()] ?? 'geojson';
      config['format'] = format;
      config['featureOperation'] = 'insert';
      config['tableHandling'] = 'create_if_needed';
      if (dataset) {
        config['dataset'] = dataset;
        config['tableName'] = this.basename(dataset);
      }
      this.applyPostgisConfig(snippet, config);
      return config;
    }

    const distance = this.readValue(snippet, /(?:BUFFER_DISTANCE|DISTANCE)\s+(-?\d+(?:\.\d+)?)/i);
    if (distance) {
      config['distance'] = Number(distance);
      config['distance_m'] = Number(distance);
      config['unit'] = 'meters';
    }

    const sourceSrid = this.readValue(snippet, /(?:SOURCE_SRID|SOURCE_COORD_SYS|SOURCE_EPSG)\s+(-?\d+)/i);
    const targetSrid = this.readValue(snippet, /(?:DEST_SRID|DEST_COORD_SYS|TARGET_EPSG)\s+(-?\d+)/i);
    if (sourceSrid) {
      config['source_srid'] = Number(sourceSrid);
      config['sourceSrid'] = Number(sourceSrid);
    }
    if (targetSrid) {
      config['target_srid'] = Number(targetSrid);
      config['targetSrid'] = Number(targetSrid);
    }

    if (kind.transformerKind === 'tester') {
      const attribute = this.readQuoted(snippet, /TEST(?:ER)?\s+"?([^"\n]+)"?/i) ?? 'name';
      config['conditions'] = [{ attribute, operator: '=', value: '' }];
    }

    if (kind.transformerKind === 'topology_validator') {
      config['heal'] = true;
    }

    return config;
  }

  private applyPostgisConfig(snippet: string, config: Record<string, unknown>): void {
    const host = this.readValue(snippet, /POSTGIS_HOST\s+(\S+)/i);
    const port = this.readValue(snippet, /POSTGIS_PORT\s+(\d+)/i);
    const database = this.readValue(snippet, /POSTGIS_DATABASE\s+(\S+)/i);
    const username = this.readValue(snippet, /POSTGIS_USER(?:NAME)?\s+(\S+)/i);
    const password = this.readValue(snippet, /POSTGIS_PASSWORD\s+(\S+)/i);
    const schema = this.readValue(snippet, /POSTGIS_SCHEMA\s+(\S+)/i);
    const table = this.readValue(snippet, /POSTGIS_TABLE\s+(\S+)/i);

    if (host || database || username) {
      config['format'] = 'postgis';
      config['postgisConnection'] = {
        host: host ?? '$(PG_HOST)',
        port: port ? Number(port) : 5432,
        database: database ?? '$(PG_DATABASE)',
        username: username ?? '$(PG_USER)',
        password: password ?? '$(PG_PASSWORD)',
        sslMode: 'prefer',
      };
    }
    if (schema) {
      config['schema'] = schema;
    }
    if (table) {
      config['tableName'] = table;
    }
  }

  private findDatasetForKeyword(content: string, keyword: string): string | null {
    return (
      this.readQuoted(content, new RegExp(`${keyword}_DATASET\\s+"([^"]+)"`, 'i')) ??
      this.readValue(content, new RegExp(`${keyword}_DATASET\\s+(\\S+)`, 'i')) ??
      this.readQuoted(content, new RegExp(`DATASET\\s+"([^"]*${keyword}[^"]*)"`, 'i'))
    );
  }

  private parsePosition(raw: string | null, index: number): { x: number; y: number } {
    if (!raw) {
      return this.gridPosition(index);
    }
    const parts = raw.trim().split(/\s+/);
    if (parts.length >= 2) {
      return { x: Number(parts[0]), y: Number(parts[1]) };
    }
    return this.gridPosition(index);
  }

  private gridPosition(index: number): { x: number; y: number } {
    const cols = 4;
    const col = index % cols;
    const row = Math.floor(index / cols);
    return { x: 80 + col * 240, y: 80 + row * 140 };
  }

  private parseBookmarkRect(
    topLeft: string | null,
    bottomRight: string | null,
    boundingRect: string | null,
    index: number,
  ): { position: { x: number; y: number }; size: { width: number; height: number } } {
    if (topLeft && bottomRight) {
      const [x1, y1] = topLeft.split(/\s+/).map(Number);
      const [x2, y2] = bottomRight.split(/\s+/).map(Number);
      return {
        position: { x: Math.min(x1, x2), y: Math.min(y1, y2) },
        size: { width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) },
      };
    }

    if (boundingRect) {
      const parts = boundingRect.split(/\s+/).map(Number);
      if (parts.length >= 4) {
        return {
          position: { x: parts[0], y: parts[1] },
          size: { width: parts[2], height: parts[3] },
        };
      }
    }

    return {
      position: { x: 40 + index * 20, y: 40 + index * 20 },
      size: { width: 400, height: 300 },
    };
  }

  private parseRgbaColour(raw: string | null): string | undefined {
    if (!raw) {
      return undefined;
    }
    const parts = raw.split(',').map((part) => Number(part.trim()));
    if (parts.length < 3) {
      return undefined;
    }
    const [r, g, b] = parts.map((value) => Math.round(value * 255));
    const toHex = (value: number) => value.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private readValue(text: string, pattern: RegExp): string | null {
    const match = text.match(pattern);
    return match?.[1] ?? null;
  }

  private readQuoted(text: string, pattern: RegExp): string | null {
    const match = text.match(pattern);
    return match?.[1] ?? null;
  }

  private extractXmlAttribute(snippet: string, name: string): string | null {
    const pattern = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i');
    return this.readQuoted(snippet, pattern);
  }

  private basename(path: string): string {
    const cleaned = path.replace(/\\/g, '/');
    const parts = cleaned.split('/');
    const last = parts[parts.length - 1] ?? 'features';
    return last.replace(/\.[^.]+$/, '') || 'features';
  }
}
