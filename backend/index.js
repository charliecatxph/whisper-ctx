// server
require("dotenv").config();
const path = require("path");
const cors = require("cors");
const express = require("express");
const app = express();
const httpServer = require("http").createServer(app);
const io = require("socket.io")(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// authentication and encryption
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const PORT = process.env.PORT || 3000;

const listen = () => {
  httpServer.listen(PORT);
  console.log(`HTTP server is now listening at PORT ${PORT}!`.bold.yellow);
};

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));
app.use(
  cors({
    origin: "*",
  })
);

// ui-ux
const colors = require("colors");

// database
const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  name: { type: String, required: true },
  pfp: { type: String, required: true },
});

const friendSchema = new mongoose.Schema({
  id: { type: String },
  date: { type: Date, default: new Date() },
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  secu_key: { type: String, required: true },
  bday: { type: Date, required: true },
  pfp: { type: String, default: "" },
  chats: [{ type: String }],
  friends: [{ type: String }],
  friendReq: [friendSchema],
  joined: { type: Date, default: new Date() },
});

const chatSchema = new mongoose.Schema({
  // _id used for identifying chat
  members: [memberSchema],
  latestMessage: { type: String },
  createdOn: { type: Date, default: new Date() },
});

const messageSchema = new mongoose.Schema({
  // _id used for identifying source
  chatId: { type: String },
  message: { type: String },
  sentBy: [memberSchema],
  sentOn: { type: Date, default: new Date() },
});

const User = mongoose.model("whisper-users", userSchema);
const Chat = mongoose.model("whisper-chats", chatSchema);
const Message = mongoose.model("whisper-messages", messageSchema);

mongoose
  .connect(process.env.DB)
  .then((d) => {
    console.log(`Connected to DB : ${d.connections[0].host}`.bold.blue);
    // routes

    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "../frontend/index.html"));
    });

    app.post("/_whisper-api/message-api", (req, res) => {
      const { chatId, payload_size } = req.body;
      Message.find(
        { chatId: chatId },
        null,
        { sort: { sentOn: 1 } },
        (err, data) => {
          if (err) {
            return res.json({ message: "Error occured.", success: false });
          }

          if (!data) {
            return res.json({ message: "No messages.", success: true });
          }
          data = data.reverse();
          const payload_back = data.slice(0, payload_size).reverse();
          return res.json({
            message: payload_back,
            data_lim: data.length,
            success: true,
          });
        }
      );
    });

    app.post("/_whisper-api/get-chats", (req, res) => {
      const { id } = req.body;

      User.findById(id, async (err, data) => {
        if (err) {
          return res.json({ message: "Error occured.", success: false });
        }

        if (!data) {
          return res.json({ message: "No chats.", success: false });
        }

        let chat_arr = data.chats.map(async (d) => {
          const data = await Chat.findOne({ _id: d });
          return {
            id: data._id,
            members: data.members,
            latestMessage: data.latestMessage,
            createdOn: data.createdOn,
          };
        });

        const reply = await Promise.all(chat_arr);

        return res.json({ message: reply, success: true });
      });
    });

    app.post("/_whisper-api/accept-friend-req", (req, res) => {
      const { id, friend_id } = req.body;

      User.findById(friend_id, (err, data) => {
        if (err) {
          return res.json({ message: "Error occured.", success: false });
        }

        if (!data) {
          return res.json({ message: "User doesn't exist.", success: false });
        }

        data.friends.push(id);

        data.save().then((d) => {
          User.findById(id, (err2, data2) => {
            if (err2) {
              return res.json({ message: "Error occured.", success: false });
            }

            if (!data2) {
              return res.json({
                message: "User doesn't exist.",
                success: false,
              });
            }

            data2.friends.push(friend_id);

            data2.save().then((d) => {
              User.findOneAndUpdate(
                { _id: id },
                { $pull: { friendReq: { id: friend_id } } },
                (err3, data3) => {
                  if (err3) {
                    return res.json({
                      message: "Error occured.",
                      success: false,
                    });
                  }

                  const chat = new Chat({
                    latestMessage: "",
                  });

                  chat.members.push({
                    userId: id,
                    name: data2.name,
                    pfp: data2.pfp,
                  });
                  chat.members.push({
                    userId: friend_id,
                    name: data.name,
                    pfp: data.pfp,
                  });

                  chat.save().then((chatData) => {
                    data.chats.push(chatData._id);

                    data.save().then((d) => {
                      data2.chats.push(chatData._id);

                      data2.save().then((d) => {
                        return res.json({
                          message: "Friend request accepted.",
                          success: true,
                        });
                      });
                    });
                  });
                }
              );
            });
          });
        });
      });
    });

    app.post("/_whisper-api/add-friend", (req, res) => {
      const { id, friend_id } = req.body;

      User.findById(friend_id, (err, data) => {
        if (err) {
          return res.json({ message: "Error occured.", success: false });
        }

        if (!data) {
          return res.json({ message: "User doesn't exist.", success: false });
        }

        User.findOne({ _id: id, friends: friend_id }, (err2, data2) => {
          if (err2) {
            return res.json({ message: "Error occured.", success: false });
          }

          if (data2) {
            return res.json({
              message: "You're already friends with this user.",
              success: false,
            });
          }

          User.findOne({ _id: friend_id, friends: id }, (err3, data3) => {
            if (err3) {
              return res.json({ message: "Error occured.", success: false });
            }

            if (data3) {
              return res.json({
                message: "You're already friends with this user.",
                success: false,
              });
            }

            User.findOne(
              { _id: friend_id, "friendReq.id": id },
              (err4, data4) => {
                if (err4) {
                  return res.json({
                    message: "Error occured.",
                    success: false,
                  });
                }

                if (data4) {
                  return res.json({
                    message: "Friend request already sent.",
                    success: false,
                  });
                }

                data.friendReq.push({ id: id });

                data.save().then((d) => {
                  return res.json({
                    message: "Friend request sent.",
                    success: true,
                  });
                });
              }
            );
          });
        });
      });
    });

    app.post("/_whisper-api/friends-query", (req, res) => {
      const { id, mode, search_id } = req.body;

      if (!id || !mode) {
        return res.json({
          message: "Important fields missing. ",
          success: false,
        });
      }

      if (mode === "REQUEST_FRIENDS") {
        User.findById(id, async (err, data) => {
          if (err) {
            return res.json({ message: "Error occured.", success: false });
          }

          if (!data) {
            return res.json({ message: "User doesn't exist.", success: false });
          }

          let friends_arr = data.friends.map(async (d) => {
            const data = await User.findOne({ _id: d });

            return {
              _id: data._id,
              name: data.name,
              pfp: data.pfp,
            };
          });

          const reply = await Promise.all(friends_arr);

          return res.json({ message: reply, success: true });
        });
      } else if (mode === "SEARCH_USER") {
        if (!search_id) {
          return res.json({ message: "No ID provided.", success: false });
        }

        User.findById(search_id, (err, data) => {
          if (err) {
            return res.json({ message: "Invalid user ID.", success: false });
          }

          if (!data) {
            return res.json({ message: "User not found.", success: false });
          }

          return res.json({
            message: {
              _id: data._id,
              name: data.name,
              bday: data.bday,
              pfp: data.pfp,
            },
            success: true,
          });
        });
      } else if (mode === "REQUEST_FRIEND_REQUESTS") {
        User.findOne({ _id: id }, async (err, data) => {
          if (err) {
            return res.json({ message: "Error occured.", success: false });
          }

          if (!data) {
            return res.json({ message: "User not found.", success: false });
          }

          let friends_req_arr = data.friendReq.map(async (d) => {
            const data = await User.findOne({ _id: d.id });

            return {
              _id: data._id,
              name: data.name,
              pfp: data.pfp,
            };
          });

          const reply = await Promise.all(friends_req_arr);

          return res.json({ message: reply, success: true });
        });
      } else {
        return res.json({ message: "Invalid mode.", success: false });
      }
    });

    app.post("/_whisper-api/change-pfp", (req, res) => {
      const { id, newImage } = req.body;

      if (!id) {
        return res.json({
          message: "Important fields missing.",
          success: false,
        });
      }

      User.findById(id, (err, data) => {
        if (err) {
          return res.json({ message: "Error occured.", success: false });
        }

        if (!data) {
          return res.json({ message: "User doesn't exist.", success: false });
        }

        data.pfp = newImage;

        data.save().then((d) => {
          const payload = {
            _id: d._id,
            name: d.name,
            bday: d.bday,
            pfp: d.pfp,
          };
          const token = jwt.sign(payload, process.env.JWT_SECRET);

          return res.json({
            token: token,
            success: true,
          });
        });
      });
    });

    app.post("/_whisper-api/forget-password", (req, res) => {
      const { email, password, secu_key } = req.body;

      if (!email || !password || !secu_key)
        return res.json({
          message: "Important fields missing.",
          success: false,
        });

      User.findOne({ email: email }, async (err, data) => {
        if (err) return res.json({ message: "Error occured!", success: false });
        if (!data)
          return res.json({ message: "User doesn't exist!", success: false });

        const secu_keyC = await bcrypt.compare(secu_key, data.secu_key);

        if (secu_keyC) {
          const hash = await bcrypt.hash(password, 12);
          data.password = hash;

          data.save().then((d) => {
            return res.json({
              message: "Password successfully changed.",
              success: true,
            });
          });
        } else {
          return res.json({
            message: "Wrong Secu-Key®.",
            success: false,
          });
        }
      });
    });

    app.post("/_whisper-api/register", (req, res) => {
      const { name, email, password, secu_key, bday, pfp } = req.body;

      if (!name || !email || !password || !secu_key || !bday) {
        return res.json({
          message: "Important fields missing.",
          success: false,
        });
      }

      User.findOne({ email: email }, async (err, data) => {
        if (err) return res.json({ message: "Error occured.", success: false });
        if (data) return res.json({ message: "Email in-use.", success: false });
        const hash = await bcrypt.hash(password, 12);
        const hash2 = await bcrypt.hash(secu_key, 12);

        const user = new User({
          name: name,
          email: email,
          password: hash,
          secu_key: hash2,
          bday: bday,
          pfp: pfp || "",
        });

        user.save().then((d) => {
          return res.json({
            message: `${d.name} has been registered!`,
            success: true,
          });
        });
      });
    });

    app.post("/_whisper-api/login", (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.json({
          message: "Important fields missing.",
          success: false,
        });
      }

      User.findOne({ email: email }, async (err, data) => {
        if (err) return res.json({ message: "Error occured.", success: false });
        if (!data)
          return res.json({ message: "User doesn't exist.", success: false });

        const verify_password = await bcrypt.compare(password, data.password);

        if (!verify_password) {
          return res.json({ message: "Wrong password!", success: false });
        }

        const payload = {
          _id: data._id,
          name: data.name,
          bday: data.bday,
          pfp: data.pfp,
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET);

        return res.json({
          token: token,
          success: true,
        });
      });
    });

    app.post("/_whisper-api/verify", (req, res) => {
      const token = req.headers["authorization"];

      try {
        const verify = jwt.verify(token, process.env.JWT_SECRET);
        res.json(verify);
      } catch (e) {
        res.json(false);
      }
    });
    listen();
  })
  .catch((e) => {
    app.get("*", (req, res) => {
      res.send(
        "Can't connect to server. Please contact @charliecatxph about this issue."
      );
    });
    listen();
  });

// socket-io
io.on("connection", (socket) => {
  socket.on("join", (rm) => {
    socket.join(rm);
  });

  socket.on("message", (message, rm, sender) => {
    const message_db = new Message({
      chatId: rm,
      message: message,
    });

    message_db.sentBy.push({
      userId: sender.userId,
      name: sender.name,
      pfp: sender.pfp,
    });

    message_db.save().then((d) => {
      Chat.findById(rm, (err, data) => {
        if (err) {
          return;
        }

        if (!data) {
          return;
        }

        data.latestMessage = message;

        data.save().then((d) => {
          io.sockets.to(rm).emit("reply", message, sender);
        });
      });
    });
  });

  socket.on("leave", (e) => {
    socket.leave(e);
  });
});
