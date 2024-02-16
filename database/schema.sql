create table user_type
(
    id   int auto_increment
        primary key,
    name varchar(25) not null
);

create table users
(
    id         int auto_increment
        primary key,
    username   varchar(50)  not null,
    password   varchar(255) not null,
    name       varchar(50)  not null,
    user_type  int          not null,
    is_member  tinyint(1)   not null,
    created_at datetime     not null,
    edited_at  datetime     null,
    last_login datetime     null,
    constraint username
        unique (username),
    constraint users_user_type_id_fk
        foreign key (user_type) references user_type (id)
);

create table members
(
    id              int auto_increment
        primary key,
    user_id         int        not null,
    start_date      datetime   not null,
    end_date        datetime   not null,
    is_active       tinyint(1) not null,
    terminated_date datetime   null,
    terminated_type int        null,
    constraint members_users_id_fk
        foreign key (user_id) references users (id)
);

create table urls
(
    id            int auto_increment
        primary key,
    short_url     varchar(100) not null,
    long_url      longtext     not null,
    created_at    datetime     not null,
    expired_at    datetime     not null,
    last_visited  datetime     null,
    total_visited int          not null,
    user_id       int          null,
    constraint urls_pk2
        unique (short_url),
    constraint urls_users_id_fk
        foreign key (user_id) references users (id)
);

