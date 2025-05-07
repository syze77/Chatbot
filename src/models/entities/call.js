const sequelize = require('../connections/connection.js')
const {DataTypes} = require('sequelize');

const Call = sequelize.define(
    'call',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        position: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM('PENDING', 'ACTIVE', 'WAITING', 'COMPLETED'),
            allowNull: false,
        },
        createDate: {
            type: DataTypes.DATE,
        },
        dateTimeFinish: {
            type: DataTypes.DATE,
        },
        rating: {
            type: DataTypes.INTEGER,
            validate: {
                min: 1,
                max: 5
            }
        },
    },
    {
        timestamps: false,
    }
);

module.exports = Call;