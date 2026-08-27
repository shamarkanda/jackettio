import cache from '../cache.js';
import config from '../config.js';

export default class Tmdb {

  static id = 'tmdb';
  static name = 'The Movie Database';

  async getMovieById(id, language){
    
    const searchId = await this.#request('GET', `/3/find/${id}`, {query: {external_source: 'imdb_id', language: language || 'en-US'}}, {key: `searchId:${id}:${language || '-'}`, ttl: 3600*3});
    const meta = searchId.movie_results[0];
    if(!meta) throw new Error(`No TMDB movie results found for IMDB ID: ${id}`);

    const localizedName = language ? meta.title || meta.original_title : meta.original_title || meta.title;
    const originalName = meta.original_title || meta.title;

    return {
      name: localizedName,
      originalName: localizedName !== originalName ? originalName : undefined,
      year: parseInt(`${meta.release_date}`.split('-').shift()),
      imdb_id: id,
      type: 'movie',
      stremioId: id,
      id,
    };

  }

  async getEpisodeById(id, season, episode, language){

    const searchId = await this.#request('GET', `/3/find/${id}`, {query: {external_source: 'imdb_id'}}, {key: `searchId:${id}`, ttl: 3600*3});
    if(!searchId.tv_results[0]) throw new Error(`No TMDB TV results found for IMDB ID: ${id}`);
    const meta = await this.#request('GET', `/3/tv/${searchId.tv_results[0].id}`, {query: {language: language || 'en-US'}}, {key: `${id}:${language}`, ttl: 3600*3});

    const episodes = [];
    meta.seasons.forEach(s => {
      for(let e = 1; e <= s.episode_count; e++){
        episodes.push({
          season: s.season_number,
          episode: e,
          stremioId: `${id}:${s.season_number}:${e}`
        });
      }
    });

    const localizedName = language ? meta.name || meta.original_name : meta.original_name || meta.name;
    const originalName = meta.original_name || meta.name;

    return {
      name: localizedName,
      originalName: localizedName !== originalName ? originalName : undefined,
      year: parseInt(`${meta.first_air_date}`.split('-').shift()),
      imdb_id: id,
      type: 'series',
      stremioId: `${id}:${season}:${episode}`,
      id,
      season,
      episode,
      episodes
    };

  }

  async getLanguages(){
    return [{value: '', label: '🌎Original (Recommended)'}].concat(...config.languages.map(language => ({value: language.iso639, label: language.label})).filter(language => language.value));
  }

  async #request(method, path, opts, cacheOpts){

    if(!config.tmdbAccessToken){
      throw new Error(`config.tmdbAccessToken is not configured`);
    }

    cacheOpts = Object.assign({key: '', ttl: 0}, cacheOpts || {});
    opts = opts || {};
    opts = Object.assign(opts, {
      method,
      headers: Object.assign(opts.headers || {}, {
        'accept': 'application/json',
        'authorization': `Bearer ${config.tmdbAccessToken}`
      })
    });

    let data;

    if(cacheOpts.key){
      data = await cache.get(`tmdb:${cacheOpts.key}`);
      if(data)return data;
    }

    const url = `https://api.themoviedb.org${path}?${new URLSearchParams(opts.query).toString()}`;
    const res = await fetch(url, opts);
    data = await res.json();

    if(!res.ok){
      throw new Error(`Invalid TMDB api result: ${JSON.stringify(data)}`);
    }

    if(data && cacheOpts.key && cacheOpts.ttl > 0){
      await cache.set(`tmdb:${cacheOpts.key}`, data, {ttl: cacheOpts.ttl})
    }

    return data;

  }

}
