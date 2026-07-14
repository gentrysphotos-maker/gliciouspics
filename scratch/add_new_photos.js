const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const productsPath = path.join(rootDir, 'products.json');

// Raw data pasted from user (Excel rows)
const rawData = `
tropical-fruit-hawaii-travel-plant-photo-mountain-apple-blossom	ʻŌhiʻa ʻai	Hawaiian for Mountain Apple, this tree was brought to the islands on canoes and used for its wood and fruit. The beautiful purple blossom closely resembling the native ʻŌhiʻa lehua. Fresh covered in droplets after a light morning rain. The fruit is sweet and crisp and is a summer to fall treat.	flora-fauna	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783968556/gliciouspics/flora-fauna/tropical-fruit-hawaii-travel-plant-photo-mountain-apple-blossom.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970569/gliciouspics/flora-fauna/black%20frame/hawaii-purple-ohia-black-frame-photo.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783971211/gliciouspics/flora-fauna/room%20mockups/hawaii-wall-art-mockup-06.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970987/gliciouspics/flora-fauna/metal%20mockups/hawaii-fine-art-metal-print-mockup-09.jpg
hawaii-tropical-flower-japanese-lantern-hanging-hibiscus-photo	Japanese Lantern	The Hanging Hibiscus otherwise know as the Japanese Lantern has a unique and very distinct look compared to other hibiscus flowers. The flower is fringed and unlike any other hubiscus around. One of the coolest hibiscus flowers around!	flora-fauna	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783968563/gliciouspics/flora-fauna/hawaii-tropical-flower-japanese-lantern-hanging-hibiscus-photo.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970567/gliciouspics/flora-fauna/black%20frame/hanging-hibiscus-japanese-lantern-black-frame.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783971211/gliciouspics/flora-fauna/room%20mockups/hawaii-wall-art-mockup-08.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970983/gliciouspics/flora-fauna/metal%20mockups/hawaii-fine-art-metal-print-mockup-04.jpg
hawaii-hibiscus-japanese-lantern-flower-fine-art	Tip of the Lantern	A zoomed in shot of the tip pf a Japanese Lantern. The intricate details of the stigma branches ready to receive pollen and the long, slender tube leading there. Flowers are so complex and interesting and getting a up close and personal view of the unique details and complexities of nature is something that I really enjoy. Nature really is something wonderful to be enjoyed and admired.	flora-fauna	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783968563/gliciouspics/flora-fauna/hawaii-hibiscus-japanese-lantern-flower-fine-art.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970569/gliciouspics/flora-fauna/black%20frame/hawaii-flower-framed-art-print.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783971209/gliciouspics/flora-fauna/room%20mockups/hawaii-wall-art-mockup-09.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970992/gliciouspics/flora-fauna/metal%20mockups/hawaii-fine-art-metal-print-mockup-08.jpg
hawaiian-native-tropical-flower-hibiscus-waiamea-photo	Hibiscus Waiamea (Kokiʻo Keʻokeʻo)	Don't ask me to say that twice. One of the few native Hawaiian hibiscus plants. This flower with white petals and a distinct long, red staminal column is only found in Hawaii and most commonly on O‘ahu in the mountains. Got lucky enough to come across a large shrub while hiking, but it was just after a windy rainstorm and only a solo flower was left standing strong.	flora-fauna	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783968558/gliciouspics/flora-fauna/hawaiian-native-tropical-flower-hibiscus-waiamea-photo.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970571/gliciouspics/flora-fauna/black%20frame/hawaiian-hibiscus-framed-fine-art.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783971207/gliciouspics/flora-fauna/room%20mockups/hawaii-wall-art-mockup-04.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970992/gliciouspics/flora-fauna/metal%20mockups/hawaii-fine-art-metal-print-mockup-06.jpg
hawaii-ginger-tropical-jungle-nature-photography	White Ginger	Aka White Butterfly Ginger, named after the delicate, butterfly-shaped petals. It is super fragrant during the late summer months and can be found in wet forested areas. Its beautiful and because of the aroma, is often used in Leis. Hiking and smelling this sweet scent is one of the most magical experiences.	flora-fauna	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783968559/gliciouspics/flora-fauna/hawaii-ginger-tropical-jungle-nature-photography.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970569/gliciouspics/flora-fauna/black%20frame/hawaii-white-ginger-art-print-framed.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783971212/gliciouspics/flora-fauna/room%20mockups/hawaii-wall-art-mockup-05.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970985/gliciouspics/flora-fauna/metal%20mockups/hawaii-fine-art-metal-print-mockup-07.jpg
hawaii-native-birds-nene-goose-nature-fine-art	Nēnē	The Hawaiian state bird. Adapted for life in the grasslands as well as the harsh hawaiian lava fields. Found on Big Island, Kauaʻi and Maui, they give off a  soft call that sounds like, nay-nay. They are distinct and cool and pretty mellow as long as you leave them alone. I was exploring Kauaʻi when I came across these beauties, standing tall and enjoying some light rain on a partly cloudy day. 	flora-fauna	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783968563/gliciouspics/flora-fauna/hawaii-native-birds-nene-goose-nature-fine-art.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970570/gliciouspics/flora-fauna/black%20frame/native-hawaiian-bird-framed-print.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783971206/gliciouspics/flora-fauna/room%20mockups/hawaii-wall-art-mockup-03.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783970993/gliciouspics/flora-fauna/metal%20mockups/hawaii-fine-art-metal-print-mockup-05.jpg
san-diego-la-jolla-scripps-pier-sunset-fine-art	San Diego Sunset Dreams (Horizontal)	Coastal cities are the best. I could not imagine living anywhere far away from the ocean. In San Diego I was blessed with one of the most incredible sunsets over La Jolla and Scripps pier. (In a horizontal view) 	landscapes	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783971396/gliciouspics/landscapes/san-diego-la-jolla-scripps-pier-sunset-fine-art.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972515/gliciouspics/landscapes/black%20frame/san-diego-sunset-pier-framed-art.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972895/gliciouspics/landscapes/room%20mockups/san-diego-wall-art-mockup.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972641/gliciouspics/landscapes/metal%20mockups/san-diego-fine-art-metal-print-mockup.jpg
hawaii-landscape-waterfall-big-island-photography	ʻAkaka Falls	Big Island has so many great waterfalls and this one is on the top of the list. A huge waterfall that drops over 400ft into a deep valley, surrounded by lush greenery, is out of this world. Crazy fact, a freshwater Goby, the ʻoʻopu ʻalamoʻo, is known to scale this steep fall to get to the streams above.	landscapes	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783971401/gliciouspics/landscapes/hawaii-landscape-waterfall-big-island-photography.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972512/gliciouspics/landscapes/black%20frame/big-island-waterfall-fine-art-framed.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972890/gliciouspics/landscapes/room%20mockups/hawaii-wall-art-mockup-01.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972639/gliciouspics/landscapes/metal%20mockups/hawaii-fine-art-metal-print-mockup-02.jpg
hawaii-sunset-waimea-bay-jump-rock-art-print	Jump Rock Sunset	The famous Waimea Bay jump rock stand 25-30 feet above the crystal clear waters of the north shore. In the summer, thousands test their fears and jump from the rock into the warm waters below. A great place to hang out and enjoy the show, I witnessed one of the best sunsets I have ever seen in my life!	landscapes	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783971399/gliciouspics/landscapes/hawaii-sunset-waimea-bay-jump-rock-art-print.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972513/gliciouspics/landscapes/black%20frame/hawaiian-sunset-north-shore-frame.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972891/gliciouspics/landscapes/room%20mockups/hawaii-wall-art-mockup-10.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972636/gliciouspics/landscapes/metal%20mockups/hawaii-fine-art-metal-print-mockup.jpg
beautiful-hawaii-travel-landscape-photography-oahu	Kāneʻohe Bay Perfection	On one of the calmest days, I went exploring with a few friends. We found the most insane view of the Kualoa Mountains reflected in the bay. The iconic mountains, a small boat and Chinamanʻs Hat just off the point was something out of a dream.	landscapes	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783971397/gliciouspics/landscapes/beautiful-hawaii-travel-landscape-photography-oahu.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972513/gliciouspics/landscapes/black%20frame/hawaii-landscape-perfection-black-frame.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972893/gliciouspics/landscapes/room%20mockups/hawaii-wall-art-mockup-12.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783972639/gliciouspics/landscapes/metal%20mockups/hawaii-fine-art-metal-print-mockup-03.jpg
hawaii-night-milky-way-travel-long-exposure-photography	Under the Stars	It is hard to catch a clear night at the right time on Oʻahu, but when you do there is nothing like it. The calm of the night, the sound of the waves and the glow of the milky way above. These are the nights that I live for.	nightscapes	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783973025/gliciouspics/nightscapes/hawaii-night-milky-way-travel-long-exposure-photography.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783973208/gliciouspics/nightscapes/black%20frame/night-time-milky-way-black-frame-photo.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783973300/gliciouspics/nightscapes/room%20mockups/hawaii-wall-art-mockup-07.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783973256/gliciouspics/nightscapes/metal%20mockups/hawaii-fine-art-metal-print-mockup-11.jpg
antelope-canyon-arizona-travel-landscape-photography-01	Curvy Canyon (Vertical)	A gorgeous slot canyon famous for the amazing colors and curves that have been created naturally by time, wind and flooding. The power of mother nature to create landscapes like this will always be inspiring. Depending on the time of day you visit, the canyon could be a deep blue and purple to a bright orange and red. (Vertical Orientation)	travel	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974293/gliciouspics/travel/antelope-canyon-arizona-travel-landscape-photography-01.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974340/gliciouspics/travel/black%20frame/arizona-antelope-canyon-black-framed-fine-art-print.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974404/gliciouspics/travel/room%20mockups/antelope-canyon-wall-art-mockup.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974376/gliciouspics/travel/metal%20mockups/antelope-canyon-fine-art-metal-print-mockup-01.jpg
antelope-canyon-arizona-travel-landscape-photography-02	Curvy Canyon (Horizontal)	A gorgeous slot canyon famous for the amazing colors and curves that have been created naturally by time, wind and flooding. The power of mother nature to create landscapes like this will always be inspiring. Depending on the time of day you visit, the canyon could be a deep blue and purple to a bright orange and red. (Horizontal Orientation)	travel	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974295/gliciouspics/travel/antelope-canyon-arizona-travel-landscape-photography-02.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974337/gliciouspics/travel/black%20frame/antelope-canyon-travel-framed-print.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974407/gliciouspics/travel/room%20mockups/antelope-canyon-wall-art-mockup-01.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974372/gliciouspics/travel/metal%20mockups/antelope-canyon-fine-art-metal-print-mockup.jpg
japan-city-night-long-exposure-travel-art-print	Tsutenkaku Nights	Located in the Shinsekai district of Osaka Japan, this tower is the center of attention. Tsutenkaku in japanese means, tower reaching heaven. The famous Hondori shopping street leads to an incredible view of the amazing tower. You can also find some really good takoyaki on this street.	travel	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974298/gliciouspics/travel/japan-city-night-long-exposure-travel-art-print.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974343/gliciouspics/travel/black%20frame/japan-travel-black-frame-photo.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974410/gliciouspics/travel/room%20mockups/japan-city-wall-art-mockup.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974378/gliciouspics/travel/metal%20mockups/japan-fine-art-metal-print-mockup.jpg
hawaii-dolphin-underwater-nature-photography-print-01	Salty Morning Dreams	Every morning that you get up early for a dive, you are hoping for a nice day in the water, but you never know when it's going to be better than nice. This day was perfect clarity, warm morning light and a pod of dolphins circling us. The dream dive encounter!	underwater	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974479/gliciouspics/underwater/hawaii-dolphin-underwater-nature-photography-print-01.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974552/gliciouspics/underwater/black%20frame/hawaii-dolphin-framed-magic.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974672/gliciouspics/underwater/room%20mockups/hawaii-wall-art-mockup-11.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974616/gliciouspics/underwater/metal%20mockups/hawaii-fine-art-metal-print-mockup-01.jpg
hawaii-dolphin-underwater-nature-photography-print-02	Dolphin Fam	One of my favorite dolphin photos that I have taken. Iʻve been lucky enough to score a few crystal clear mornings with dolphins as icing on the cake. This time a small pod was swimming around for an hour and I was able to capture this small group of four split off like their own little family. It never gets old.	underwater	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974481/gliciouspics/underwater/hawaii-dolphin-underwater-nature-photography-print-02.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974565/gliciouspics/underwater/black%20frame/underwater-dolphin-framed-fine-art.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974669/gliciouspics/underwater/room%20mockups/hawaii-wall-art-mockup-02.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974620/gliciouspics/underwater/metal%20mockups/hawaii-fine-art-metal-print-mockup-10.jpg
japan-okinawa-travel-clownfish-underwater-nature-photography	Stripes	I love Okinawa and especially these little guys. In Hawaiʻi we do not have clownfish, so every time I see one in Okinawa I get super excited. The relationship they share with their anemone is so captivating and it is fun to watch them pop in and out, hiding and staying protected, while also showing their curiosity.	underwater	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974484/gliciouspics/underwater/japan-okinawa-travel-clownfish-underwater-nature-photography.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974549/gliciouspics/underwater/black%20frame/clownfish-underwater-japan-framed-art.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974676/gliciouspics/underwater/room%20mockups/japan-wall-art-mockup.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974611/gliciouspics/underwater/metal%20mockups/clownfish-fine-art-metal-print-mockup.jpg
tahiti-baby-humpback-whale-underwater-nature-fine-art-print-01	Happy Whale Calf	A crazy interaction with a very curious baby humpback whale. In Tahiti the whale migration is awesome to experience. The baby whales are so curious and like to come up nice and close. They have no fear and its probably because they are the size of a small bus and also, mom is never far behind.	underwater	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974488/gliciouspics/underwater/tahiti-baby-humpback-whale-underwater-nature-fine-art-print-01.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974562/gliciouspics/underwater/black%20frame/tahiti-whale-fine-art-frame-print.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974680/gliciouspics/underwater/room%20mockups/tahiti-wall-art-mockup.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974623/gliciouspics/underwater/metal%20mockups/tahiti-fine-art-metal-print-mockup.jpg
tahiti-baby-humpback-whale-underwater-nature-fine-art-print-02	Wanna Play Tag	Playing tag with a baby humpback whale. This little guy swam up to me, turned around and seemingly tagged me then began to swim away as if it wanted me to chase it. They are so playful and curious. The mom was right below, keeping an eye on things, making sure her baby was safe. Beautiful! 	underwater	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974491/gliciouspics/underwater/tahiti-baby-humpback-whale-underwater-nature-fine-art-print-02.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974559/gliciouspics/underwater/black%20frame/tahiti-whale-black-frame-art.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974687/gliciouspics/underwater/room%20mockups/tahiti-wall-art-mockup-02.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974627/gliciouspics/underwater/metal%20mockups/tahiti-fine-art-metal-print-mockup-01.jpg
tahiti-baby-humpback-whale-underwater-nature-fine-art-print-03	Curious Whale	Baby humpback whales are super curious. They seem to be as interested in us as we are in them. I had an incredible moment when a baby came right up to me and then swam around and turned upside down as if it was checking me out, wondering what this weird creature was. Never a dull moment during breeding season.	underwater	standard	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974495/gliciouspics/underwater/tahiti-baby-humpback-whale-underwater-nature-fine-art-print-03.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974556/gliciouspics/underwater/black%20frame/humpback-whale-baby-black-frame-photo.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974683/gliciouspics/underwater/room%20mockups/tahiti-wall-art-mockup-01.jpg	https://res.cloudinary.com/dbqfibadw/image/upload/v1783974630/gliciouspics/underwater/metal%20mockups/tahiti-fine-art-metal-print-mockup-02.jpg
`;

// Standard pricing for standard format
const standardPricing = {
  "Lustre Paper": {
    "8x12": 50,
    "12x18": 60,
    "16x24": 75,
    "20x30": 90,
    "24x36": 110
  },
  "Matte Paper": {
    "8x12": 50,
    "12x18": 60,
    "16x24": 75,
    "20x30": 90,
    "24x36": 110
  },
  "Chromaluxe Metal": {
    "8x12": 125,
    "12x18": 200,
    "16x24": 300,
    "20x30": 400,
    "24x36": 500
  }
};

// Parse lines
const lines = rawData.trim().split('\n');
const newProducts = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  
  const cols = trimmed.split('\t').map(c => c.trim());
  if (cols.length < 5) {
    console.log('Skipping line (insufficient columns):', line);
    continue;
  }
  
  const [id, title, description, category, format, heroUrl] = cols;
  const thumbnails = [];
  for (let i = 6; i < cols.length; i++) {
    if (cols[i]) thumbnails.push(cols[i]);
  }
  
  const printImageUrl = `https://pub-f453559629f44da193072bfdba9fd762.r2.dev/${id}.jpg`;
  
  newProducts.push({
    id,
    title,
    category,
    format,
    description,
    startingPrice: 50,
    images: {
      hero: heroUrl,
      thumbnails,
      printImageUrl
    },
    pricing: standardPricing
  });
}

console.log(`Parsed ${newProducts.length} new products.`);

// Read products.json
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

// Check for duplicates
const existingIds = new Set([
  ...(products.standard || []).map(p => p.id),
  ...(products.panoramas || []).map(p => p.id),
  ...(products.aerial || []).map(p => p.id)
]);

const addedProducts = [];
for (const p of newProducts) {
  if (existingIds.has(p.id)) {
    console.warn(`Warning: Product with ID "${p.id}" already exists. Skipping.`);
  } else {
    products.standard.push(p);
    addedProducts.push(p.title);
    existingIds.add(p.id);
  }
}

if (addedProducts.length > 0) {
  // Write back to products.json
  fs.writeFileSync(productsPath, JSON.stringify(products, null, 2), 'utf8');
  console.log(`Successfully added ${addedProducts.length} new products to products.json:`);
  console.log(addedProducts.map(t => ` - ${t}`).join('\n'));
  
  // Rebuild
  console.log('\nRunning build-galleries...');
  execSync('node scripts/build-galleries.js', { stdio: 'inherit', cwd: rootDir });
  
  console.log('\nRunning build-layouts...');
  execSync('node scripts/build-layouts.js', { stdio: 'inherit', cwd: rootDir });
  
  console.log('\nRunning generate-sitemap...');
  execSync('node scripts/generate-sitemap.js', { stdio: 'inherit', cwd: rootDir });
  
  console.log('\nRunning validation...');
  try {
    execSync('npm run validate', { stdio: 'inherit', cwd: rootDir });
    console.log('\nSUCCESS: All steps built and validated successfully!');
  } catch (err) {
    console.error('\nERROR: Validation failed. Please check products.json changes.');
    process.exit(1);
  }
} else {
  console.log('No new products to add.');
}
