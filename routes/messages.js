var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var messageModel = require('../schemas/messages');
var userModel = require('../schemas/users');
var { checkLogin } = require('../utils/authHandler');

router.get('/', checkLogin, async function (req, res, next) {
  try {
    let userId = req.user._id;
    let messages = await messageModel
      .find({ $or: [{ from: userId }, { to: userId }] })
      .sort({ createdAt: -1 })
      .populate('from to', 'username email avatarUrl');

    let latestByUser = {};
    messages.forEach(function (message) {
      let otherId = message.from._id.equals(userId) ? message.to._id.toString() : message.from._id.toString();
      if (!latestByUser[otherId]) {
        latestByUser[otherId] = message;
      }
    });

    res.send(Object.values(latestByUser));
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.get('/:id', checkLogin, async function (req, res, next) {
  try {
    let userId = req.user._id;
    let otherId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(otherId)) {
      return res.status(404).send({ message: 'userID khong hop le' });
    }

    let otherUser = await userModel.findOne({ _id: otherId, isDeleted: false });
    if (!otherUser) {
      return res.status(404).send({ message: 'user khong ton tai' });
    }

    let messages = await messageModel
      .find({
        $or: [
          { from: userId, to: otherId },
          { from: otherId, to: userId }
        ]
      })
      .sort({ createdAt: 1 })
      .populate('from to', 'username email avatarUrl');

    res.send(messages);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

router.post('/', checkLogin, async function (req, res, next) {
  try {
    let userId = req.user._id;
    let { to, messageContent } = req.body;

    if (!to || !messageContent || !messageContent.type || !messageContent.text) {
      return res.status(400).send({ message: 'to va messageContent la bat buoc' });
    }

    if (!mongoose.Types.ObjectId.isValid(to)) {
      return res.status(400).send({ message: 'to khong hop le' });
    }

    let toUser = await userModel.findOne({ _id: to, isDeleted: false });
    if (!toUser) {
      return res.status(404).send({ message: 'nguoi nhan khong ton tai' });
    }

    if (!['file', 'text'].includes(messageContent.type)) {
      return res.status(400).send({ message: 'type phai la file hoac text' });
    }

    let newMessage = new messageModel({
      from: userId,
      to: to,
      messageContent: {
        type: messageContent.type,
        text: messageContent.text
      }
    });

    await newMessage.save();
    await newMessage.populate('from to', 'username email avatarUrl');

    res.send(newMessage);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
