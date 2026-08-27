import crypto from 'crypto';
import {Parser} from "xml2js";
import config from './config.js';
import cache from './cache.js';
import {numberPad, parseWords} from './util.js';

export const CATEGORY = {
  MOVIE: 2000,
  SERIES: 5000
};

export async function searchMovieTorrents({indexer, name, originalName, year}){

  indexer = indexer || 'all';
  const cacheKey = `jackettItems:3:movie:${indexer}:${name}:${originalName || ''}:${year}`;
  let items = await cache.get(cacheKey);

  if(!items){
    // Search with localized and original name in parallel to cover both Spanish and international indexers
    const queries = [{t: 'movie', q: name}];
    if(originalName && originalName !== name){
      queries.push({t: 'movie', q: originalName});
    }

    const results = await Promise.all(queries.map(query =>
      jackettApi(`/api/v2.0/indexers/${indexer}/results/torznab/api`, query)
        .then(res => res?.rss?.channel?.item || [])
        .catch(() => [])
    ));

    const seen = new Set();
    items = results.flat().filter(item => {
      const guid = item?.guid;
      if(!guid || seen.has(guid)) return false;
      seen.add(guid);
      return true;
    });

    cache.set(cacheKey, items, {ttl: items.length > 0 ? 3600*36 : 60});
  }

  return normalizeItems(items);

}

export async function searchSerieTorrents({indexer, name, originalName, year}){

  indexer = indexer || 'all';
  const cacheKey = `jackettItems:3:serie:${indexer}:${name}:${originalName || ''}:${year}`;
  let items = await cache.get(cacheKey);

  if(!items){
    const queries = [{t: 'search', cat: CATEGORY.SERIES, q: name}];
    if(originalName && originalName !== name){
      queries.push({t: 'search', cat: CATEGORY.SERIES, q: originalName});
    }

    const results = await Promise.all(queries.map(query =>
      jackettApi(`/api/v2.0/indexers/${indexer}/results/torznab/api`, query)
        .then(res => res?.rss?.channel?.item || [])
        .catch(() => [])
    ));

    const seen = new Set();
    items = results.flat().filter(item => {
      const guid = item?.guid;
      if(!guid || seen.has(guid)) return false;
      seen.add(guid);
      return true;
    });

    cache.set(cacheKey, items, {ttl: items.length > 0 ? 3600*36 : 60});
  }

  return normalizeItems(items);

}

export async function searchSeasonTorrents({indexer, name, year, season}){

  indexer = indexer || 'all';
  const cacheKey = `jackettItems:2:season:${indexer}:${name}:${year}:${season}`;
  let items = await cache.get(cacheKey);

  if(!items){
    const res = await jackettApi(
      `/api/v2.0/indexers/${indexer}/results/torznab/api`,
      {t: 'search', cat: CATEGORY.SERIES, q: `${name} S${numberPad(season)}`}
    );
    items = res?.rss?.channel?.item || [];
    cache.set(cacheKey, items, {ttl: items.length > 0 ? 3600*36 : 60});
  }

  return normalizeItems(items);

}

export async function searchEpisodeTorrents({indexer, name, originalName, year, season, episode}){

  indexer = indexer || 'all';
  const cacheKey = `jackettItems:3:episode:${indexer}:${name}:${year}:${season}:${episode}`;
  let items = await cache.get(cacheKey);

  if(!items){
    const queries = [
      // Native tvsearch with season/ep params — lets Jackett handle filtering per indexer
      {t: 'tvsearch', q: name, season: season, ep: episode},
      // Fallback: Spanish naming format (1x05) for indexers with poor tvsearch support
      {t: 'search', cat: CATEGORY.SERIES, q: `${name} ${season}x${numberPad(episode)}`},
      // Fallback: original name tvsearch for international indexers
      ...(originalName && originalName !== name ? [{t: 'tvsearch', q: originalName, season: season, ep: episode}] : [])
    ];

    const results = await Promise.all(queries.map(query =>
      jackettApi(`/api/v2.0/indexers/${indexer}/results/torznab/api`, query)
        .then(res => res?.rss?.channel?.item || [])
        .catch(() => [])
    ));

    // Merge and deduplicate by guid
    const seen = new Set();
    items = results.flat().filter(item => {
      const guid = item?.guid;
      if(!guid || seen.has(guid)) return false;
      seen.add(guid);
      return true;
    });

    cache.set(cacheKey, items, {ttl: items.length > 0 ? 3600 * 6 : 120});
  }

  return normalizeItems(items);
}

export async function getIndexers(){

  const res = await jackettApi(
    '/api/v2.0/indexers/all/results/torznab/api',
    {t: 'indexers', configured: 'true'}
  );

  return normalizeIndexers(res?.indexers?.indexer || []);

}

async function jackettApi(path, query){

  const params = new URLSearchParams(query || {});
  params.set('apikey', config.jackettApiKey);

  const url = `${config.jackettUrl}${path}?${params.toString()}`;

  let data;
  const res = await fetch(url);
  if(res.headers.get('content-type').includes('application/json')){
    data = await res.json();
  }else{
    const text = await res.text();
    const parser = new Parser({explicitArray: false, ignoreAttrs: false});
    data = await parser.parseStringPromise(text);
  }

  if(data.error){
    throw new Error(`jackettApi: ${url.replace(/apikey=[a-z0-9\-]+/, 'apikey=****')} : ${data.error?.$?.description || data.error}`);
  }

  return data;

}

function normalizeItems(items){
  return forceArray(items).map(item => {
    item = mergeDollarKeys(item);
    const attr = item['torznab:attr'].reduce((obj, item) => {
      obj[item.name] = item.value;
      return obj;
    }, {});
    const quality = item.title.match(/(2160|1080|720|480|360)p/);
    const title = parseWords(item.title).join(' ');
    const year = item.title.replace(quality ? quality[1] : '', '').match(/(19|20[\d]{2})/);
    return {
      name: item.title,
      guid: item.guid,
      indexerId: item.jackettindexer.id,
      id: crypto.createHash('sha1').update(item.guid).digest('hex'),
      size: parseInt(item.size),
      link: item.link,
      seeders: parseInt(attr.seeders || 0),
      peers: parseInt(attr.peers || 0),
      infoHash: attr.infohash || '',
      magneturl: attr.magneturl || '', 
      type: item.type,
      quality: quality ? parseInt(quality[1]) : 0,
      year: year ? parseInt(year.pop()) : 0,
      languages: config.languages.filter(lang => title.match(lang.pattern))
    };
  });
}

function normalizeIndexers(items){
  return forceArray(items).map(item => {
    item = mergeDollarKeys(item);
    const searching = item.caps.searching;
    return {
      id: item.id,
      configured: item.configured == 'true',
      title: item.title,
      language: item.language,
      type: item.type,
      categories: forceArray(item.caps.categories.category).map(category => parseInt(category.id)),
      searching: {
        movie: {
          available: searching['movie-search'].available == 'yes', 
          supportedParams: searching['movie-search'].supportedParams.split(',')
        },
        series: {
          available: searching['tv-search'].available == 'yes', 
          supportedParams: searching['tv-search'].supportedParams.split(',')
        }
      }
    };
  });
}

function mergeDollarKeys(item){
  if(item.$){
    item = {...item.$, ...item};
    delete item.$;
  }
  for(let key in item){
    if(typeof(item[key]) === 'object'){
      item[key] = mergeDollarKeys(item[key]);
    }
  }
  return item;
}

function forceArray(value){
  return Array.isArray(value) ? value : [value];
}
