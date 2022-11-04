# BFL Bot
Official American Football Haxball bot of the Brazilian Football League community.
## Setup
### Stats integration and database connection
To make use of the recording and database integration systems you'll need to separately install and run the [bfl-recs](https://github.com/bfleague/bfl-recs) and the [bfl-database](https://github.com/bfleague/bfl-database) services.
### Logging
The logging module can be used to log chat messages and room connections. It is disabled by default, but can be enabled in the `.env` file.
### The `.env` file
In order to apply custom configuration to the bot you can create a `.env` file at the root of the project:
```.env
# Enable the logging module
ENABLE_LOG=true

# Add webhook URLs (required for the logging module to work)
UNSAFE_CONNECTION_LOG=""
SAFE_CONNECTION_LOG=""
CHAT_LOG=""

# Custom service ports
RECS_PORT=4000
DATABASE_PORT=3000
```
## License
[MIT](https://choosealicense.com/licenses/mit/)
## Authors
- [@gabrielbrop](https://github.com/gabrielbrop)