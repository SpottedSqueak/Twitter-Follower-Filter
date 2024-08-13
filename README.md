# 🐭 Twitter Follower Filter 
*(I refuse to call it X)*

### Filter and search your Twitter followers based on criteria you provide.
---
### [> Download Latest Release <](https://github.com/SpottedSqueak/Twitter-Follower-Filter/releases)
---
## Dev Info
Built using `node v22.6.0` and `npm v10.8.2`

Install: `npm i`

Run: `npm run start`

Build: `npm run build`

Database is `sqlite` and can be read with something like [DB Browser](https://sqlitebrowser.org/)

## Info

Boot it up and click `Query Followers` to get a Twitter login page. This is done via the browser so all the standard login methods apply (such as Two-Factor Auth). Once logged in the Twitter page closes and starts retrieving the follower list in the background, updating the database count every 10 seconds.

For my Twitter follower list, at around 11k people, it takes about an hour. Sorry!

***NOTE:*** I opted for **Firefox** as the base in this project, simply because Chrome has been going down a "Do More Harm" path with their recent updates and plans, and **Puppeteer** now has much better cross browser support for Firefox now with their [WebDriver-BiDi](https://pptr.dev/webdriver-bidi) updates! Some real cool stuff there.

That being said, you can change browsers using the `browser.json` file in the root directory. Valid options are `firefox` or `chrome`. ***It will not download a browser for you*** however, so make sure you have one of them installed!

***Why is a browser needed?*** Twitter has really limited what you can do with their API, and this leverages all the methods available to an average user if they wanted to see their entire Follower List (yes, I tried to do this by hand once).

You'll need [@radically-straightforward/package](https://github.com/radically-straightforward/radically-straightforward/tree/main/package) to build the application bundle for your OS. The resulting zip/gzip file will be a sibling of the extracted folder. Note that it will copy ALL files in the current directory, so you might want to copy only the files needed (no `.git` files or the entire `data` folder) and run the build command in that folder instead. Or just download the latest Release, whatever's easiest.


## How it works

Start it up, enter in/choose your filters, and click `Filter Followers` to have it get to work.

## #DONE

- [x] Initial functionality (query followers, filter followers, add own filters, etc.)

## #TODO

- [ ] Clean up follower query loop

## Known Issues

-- See the issues tab above!

Check out my stuff on FA if you'd like!

**SFW:** https://www.furaffinity.net/user/forest-wolf

**NSFW:** (You can find it! :P)