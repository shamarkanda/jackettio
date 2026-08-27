import debridlink from "./debrid/debridlink.js";
import alldebrid from "./debrid/alldebrid.js";
import realdebrid from './debrid/realdebrid.js';
import premiumize from './debrid/premiumize.js';
export {ERROR} from './debrid/const.js';

const debrid = {debridlink, alldebrid, realdebrid, premiumize};

export function instance(userConfig){

  // Allow running without debrid (pure indexer mode)
  if(!userConfig.debridId) return null;

  if(!debrid[userConfig.debridId]){
    throw new Error(`Debrid service "${userConfig.debridId}" not exists`);
  }
  
  return new debrid[userConfig.debridId](userConfig);
}

export const cacheCheckAvailable = Object.values(debrid).some(d => d.cacheCheckAvailable);

export async function list(){
  const values = [];
  for(const instance of Object.values(debrid)){
    values.push({
      id: instance.id,
      name: instance.name,
      shortName: instance.shortName,
      configFields: instance.configFields
    })
  }
  return values;
}
