import { SlashCommandBuilder } from "discord.js"

const responses = [
  "The Nova Bus LFS is a North American, low floor transit bus. Introduced in 1994, the design provides a level entry without steps for passengers with limited mobility. The LFS has evolved over four generations and includes articulated, hybrid, natural gas, and electric model derivatives.",
  "More useful messages will come in the future.",
  "The Fitness Gram Pacer Test is a multistage aerobic capacity test that progressively gets more difficult as it continues. The 20 meter pacer test will begin in 30 seconds. Line up at the start. The running speed starts slowly, but gets faster each minute after you hear this signal. [beep] A single lap should be completed each time you hear this sound. [ding] Remember to run in a straight line, and run as long as possible. The second time you fail to complete a lap before the sound, your test is over. The test will begin on the word start. On your mark, get ready, get set, begin.",
  "yeet",
  "Behind you.",
  "The Hunter is a Tier 3 tank in Diep.io. It upgrades from the Sniper at level 30 and upgrades to the Predator and Streamliner at level 45. The Hunter retains its old Sniper Barrel. It also has a wide Tank Barrel overlapping the Sniper Barrel, allowing it to fire two Bullets in quick succession. Using its two Barrels, the Hunter has an increased DPS (Damage Per Second) when compared to its predecessor, the Sniper. One Barrel shoots a small Bullet while the other shoots a normal-sized one, both moving at the same velocity. Both bullets are 0.7 times the size of the Barrels they fire from. Bullet damage is reduced by 25% when compared to the Sniper. The smaller Barrel has a slight spread. The tank's Bullet speed is slightly decreased. This tank's Barrels barely have any recoil at all.",
  "stop",
  "Target successfully nuked",
  "sniper no sniping (wait what)",
  "swiper no swiping",
  "NEXT STOP: 11500 BLOCK ON KING ROAD",
  "IQ: Below zero",
  "nginx",
  "there is a cybertruck posing as a dumpster in your neighbour's backyard",
  "newark when",
  "fire > ferry",
  "city dreams",
  "upgrade to windows 10",
  "the amazon prime delivery box in front of your door is actually a C4 item from Zeppelin Wars",
  "STARS AND STRIPES BEATS HAMMER AND SICKLE",
  "TWENTY ONE",
  "HAMMER AND SICKLE BEATS STARS AND STRIPES",
  "your house is currently being surrounded by the fbi",
  "your house is currently being surrounded by locust shredders",
  "beans",
  "MINE DIAMONDS MINE DIAMONDS ILL MINE EM SO FAR I GOT TWO",
  "NOOOOOOO!!!!!! YOU CANT JUST USE AN EIGHT MIL WARSHIP FOR EVERYTHING NOOOOOOO || haha iver go brrrrrrrrr",
  "the cooler beans",
  "the coolest beans",
  "the coolester beans",
  "gg no re",
  "stupid person detected",
  "Congrats, you failed your guard training! Please leave the server",
  "french baguette launcher",
  "hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat hello i am clogging your chat  aaaaaaaaaaaaaaaaaaaa",
  "you cannot rocket jump with the flak cannon",
  "9540",
]

export default {
  data: new SlashCommandBuilder().setName("lfs").setDescription("Get a random LFS-related message"),
  async execute(interaction) {
    const result = Math.floor(Math.random() * responses.length)
    await interaction.editReply(responses[result])
  },
}
