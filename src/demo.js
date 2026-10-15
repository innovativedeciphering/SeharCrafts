import sampleImage from '../assets/sample-collection.png';
import alternateImage from '../assets/sample-collection-overhead.png';
let photoIndex=0;
const photo = () => photoIndex++ % 2 === 0 ? sampleImage : alternateImage;
export {sampleImage};
export const demoProducts = [
 {id:'demo-1',name:'The Woven Bloom',category:'Baskets',description:'A little texture, a little warmth. A handwoven basket for dried flowers, cosy corners and everyday treasures.',price:3200,sale_price:2600,offer:'A thoughtful gift for a new home',images:[photo('photo-1594224457860-23bdb45f8e3d'),photo('photo-1600210492486-724fe5c67fb0')],active:true},
 {id:'demo-2',name:'Earth & Ember',category:'Decor',description:'Soft earthy tones and sculptural shapes, made for slow mornings and beautiful shelves.',price:2800,sale_price:null,offer:'Handmade in small batches',images:[photo('photo-1578749556568-bc2c40e68b61'),photo('photo-1490312278390-ab64016e0aa9')],active:true},
 {id:'demo-3',name:'Golden Hour',category:'Candles',description:'A warm accent for your favourite corner. A lovely addition to a carefully chosen gift.',price:1800,sale_price:1500,offer:'Seasonal selection',images:[photo('photo-1603006905003-be475563bc59'),photo('photo-1602874801006-e26c4f5e7e76')],active:true},
 {id:'demo-4',name:'Little Moments',category:'Gifts',description:'Thoughtful objects for the people who make ordinary days feel special.',price:4200,sale_price:3600,offer:'Gift wrapping available on request',images:[photo('photo-1549465220-1a8b9238cd48'),photo('photo-1513201099705-a9746e1e201f')],active:true}
];
