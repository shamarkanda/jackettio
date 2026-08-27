import config from './config.js';
import Cinemeta from './meta/cinemeta.js';
import Tmdb from './meta/tmdb.js';

const tmdbClient = config.tmdbAccessToken ? new Tmdb() : null;
const cinemetaClient = new Cinemeta();

export async function getMovieById(id, language){
  if(tmdbClient){
    try {
      return await tmdbClient.getMovieById(id, language);
    } catch(err) {
      // Fallback to Cinemeta when TMDB fails (e.g. missing IMDB mapping)
      console.warn(`TMDB getMovieById failed for ${id}, falling back to Cinemeta: ${err.message}`);
      return cinemetaClient.getMovieById(id);
    }
  }
  return cinemetaClient.getMovieById(id);
}

export async function getEpisodeById(id, season, episode, language){
  if(tmdbClient){
    try {
      return await tmdbClient.getEpisodeById(id, season, episode, language);
    } catch(err) {
      // Fallback to Cinemeta when TMDB fails (e.g. anime with different IMDB/TMDB mapping)
      console.warn(`TMDB getEpisodeById failed for ${id}:${season}:${episode}, falling back to Cinemeta: ${err.message}`);
      return cinemetaClient.getEpisodeById(id, season, episode);
    }
  }
  return cinemetaClient.getEpisodeById(id, season, episode);
}

export async function getLanguages(){
  if(tmdbClient) return tmdbClient.getLanguages();
  return cinemetaClient.getLanguages();
}
